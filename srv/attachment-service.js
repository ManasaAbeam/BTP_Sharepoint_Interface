const cds = require('@sap/cds');
const { log, Console } = require('console');
const fs = require('fs');
const path = require('path');
const formidable = require('formidable');
const Busboy = require('busboy')

module.exports = cds.service.impl(async function () {
  const { AttachmentFiles } = this.entities;

this.on("uploadFileToSharePoint", async (req) => {
  try {
    const { FileID, Reqno, Reqitem, Reqtype, file, fileName, mediaType } = req.data;
    let ID = FileID;

    // Validate mandatory fields (Reqitem and ID are optional)
    if (!Reqno || !Reqtype || !file || !fileName || !mediaType) {
      req.error(400, "Fields Reqno, Reqtype, file, fileName, and mediaType are mandatory.");
    }

    // Determine if this is line-item or header level
    const isLineItemLevel = !!Reqitem;
    console.log(`📋 Upload mode: ${isLineItemLevel ? 'LINE ITEM' : 'HEADER'} level`);

    // 1️⃣ Determine if this is CREATE or UPDATE based on FileID
    const isUpdate = !!FileID;
    let existingRecord = null;
    let oldFileName = null;
    let oldFileID = null;

    if (isUpdate) {
      // UPDATE mode: Fetch existing record by ID
      existingRecord = await SELECT.one.from(AttachmentFiles).where({ ID });

      if (!existingRecord) {
        req.error(404, `Record with FileID "${FileID}" not found`);
      }

      oldFileName = existingRecord.fileName;
      oldFileID = existingRecord.ID;
      console.log(`📝 UPDATE mode: Existing file "${oldFileName}" will be replaced (FileID: ${FileID})`);
    } else {
      // CREATE mode: Generate UUID before anything else
      const { uuid } = cds.utils;
      ID = uuid();
      console.log(`✨ CREATE mode: New file will be uploaded (FileID: ${ID})`);
    }

    // 2️⃣ Convert Base64 to binary
    const buffer = Buffer.from(file, "base64");

    // 3️⃣ Create temporary file folder
    const tempDir = path.join(__dirname, "attachments");
    fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const fileContent = fs.readFileSync(filePath);

    // 4️⃣ Connect to SharePoint
    const domain = "smu.sharepoint.com";
    const siteName = "SAPFIN-DEV";
    const sharePoint = await cds.connect.to("sharepoint-fin");

    // 5️⃣ Get Site ID
    const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
    const siteRes = await sharePoint.get(siteInfoUrl);
    const siteId = siteRes.id;

    // 🔹 Get driveId of default document library
const driveRes = await sharePoint.get(`/v1.0/sites/${siteId}/drive`);
const driveId = driveRes.id;


    // 6️⃣ Build SharePoint path based on level (INCLUDING FileID)
    const sharePointFolder = isLineItemLevel
      ? `SMU_Attachments/${Reqtype}/${Reqno}/${Reqitem}/${ID}`
      : `SMU_Attachments/${Reqtype}/${Reqno}/${ID}`;

      const permanentSpPath = `${sharePointFolder}/${fileName}`;


    console.log(`📁 SharePoint folder: ${sharePointFolder}`);

    // 7️⃣ If updating and (filename changed OR FileID path changed), delete old file from SharePoint
    if (isUpdate && oldFileName && oldFileID) {
      try {
        // Build old SharePoint path
        const oldSharePointFolder = isLineItemLevel
          ? `SMU_Attachments/${Reqtype}/${Reqno}/${Reqitem}/${oldFileID}`
          : `SMU_Attachments/${Reqtype}/${Reqno}/${oldFileID}`;

        const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/${oldSharePointFolder}/${oldFileName}`;
        await sharePoint.delete(deleteUrl);
        console.log(`🗑️ Deleted old file from SharePoint: ${oldFileName} (FileID: ${oldFileID})`);
      } catch (deleteError) {
        console.warn(`⚠️ Could not delete old file "${oldFileName}":`, deleteError.message);
        // Continue with upload even if delete fails
      }
    }

    // 8️⃣ Upload/Replace file to SharePoint (with FileID in path)
    const uploadUrl = `/v1.0/sites/${siteId}/drive/root:/${sharePointFolder}/${fileName}:/content`;
    const response = await sharePoint.put(uploadUrl, fileContent);

    // 9️⃣ Delete temp file
    fs.unlink(filePath, (err) => {
      if (err) console.error("Error deleting temp file:", err);
    });

    // 🔟 Get SharePoint download URL
    const downloadUrl = response["@microsoft.graph.downloadUrl"] || "";

    // 1️⃣1️⃣ Prepare database record
    const dbRecord = {
      fileName,
      mediaType,
      url: downloadUrl,

        siteId: siteId,           // NEW
  driveId: driveId,         // NEW
  spPath: permanentSpPath   // NEW
    };

    // 1️⃣2️⃣ Update or Insert metadata in database
    if (isUpdate) {
      // UPDATE existing record
      await UPDATE(AttachmentFiles)
        .set({
          ...dbRecord,
          modifiedAt: new Date(),
          modifiedBy: req.user?.id || "SYSTEM"
        })
        .where({ ID });

      console.log(`✅ Updated database record (FileID: ${ID})`);
    } else {
      // INSERT new record
      const insertData = {
        ID: ID,  // Explicitly set the ID
        Reqno,
        Reqtype,
        ...dbRecord,
        createdAt: new Date(),
        createdBy: req.user?.id || "SYSTEM"
      };

      // Only add Reqitem if it's line-item level
      if (isLineItemLevel) {
        insertData.Reqitem = Reqitem;
      }

      await INSERT.into(AttachmentFiles).entries(insertData);

      console.log(`✅ Created new database record (FileID: ${ID})`);
    }

    // 1️⃣3️⃣ Return response with operation type and ID
    return {
      FileID: ID,
      operation: isUpdate ? "UPDATE" : "CREATE",
      level: isLineItemLevel ? "LINE_ITEM" : "HEADER",
      url: downloadUrl,
      fileName: fileName,
      Reqno: Reqno,
      ...(isLineItemLevel && { Reqitem: Reqitem }),
      Reqtype: Reqtype,
      message: isUpdate
        ? `File updated successfully. Old file: "${oldFileName}", New file: "${fileName}"`
        : `File uploaded successfully: "${fileName}"`
    };

  } catch (error) {
    console.error("File upload/update failed:", error);
    req.error(500, `File upload/update failed: ${error.message}`);
  }
});

  // this.on("DownloadFiles", async (req) => {
  //   try {
  //     const { Reqno, Reqtype } = req.data;

  //     // 1️⃣ Fetch metadata from CAP DB
  //     const attachments = await SELECT.from(AttachmentFiles).where({
  //       Reqno,
  //       Reqtype
  //     });

  //     if (!attachments.length) {
  //       req.error(404, `No attachments found for ${Reqtype}/${Reqno}`);
  //     }

  //     // 2️⃣ Get stored SharePoint URLs
  //     const urls = attachments.map(att => ({
  //       fileName: att.fileName,
  //       fileID:att.ID,
  //       Reqitem: att.Reqitem,
  //       Reqno: Reqno,
  //       Reqtype: Reqtype,
  //       url: att.url,

  //     }));

  //     return urls;

  //   } catch (err) {
  //     console.error("Error fetching download URLs:", err);
  //     req.error(500, `Failed to fetch download URLs: ${err.message}`);
  //   }
  // });


  this.on("DownloadFiles", async (req) => {
  try {
    const { Reqno, Reqtype } = req.data;

    // 1️⃣ Fetch metadata for all files for this Request
    const attachments = await SELECT.from(AttachmentFiles).where({
      Reqno,
      Reqtype
    });

    if (!attachments.length) {
      req.error(404, `No attachments found for ${Reqtype}/${Reqno}`);
    }

    // 2️⃣ Connect to SharePoint destination
    const sharePoint = await cds.connect.to("sharepoint-fin");

    // 3️⃣ Generate fresh URLs for each file
    const results = [];

    for (const file of attachments) {
      const { siteId, driveId, spPath, fileName, Reqitem } = file;

      if (!siteId || !driveId || !spPath) {
        console.warn(`⚠️ Missing SharePoint metadata for ID: ${file.ID}`);
        continue;
      }

      // GET metadata from SharePoint
      const apiUrl = `/v1.0/sites/${siteId}/drives/${driveId}/root:/${spPath}`;
      const spResponse = await sharePoint.get(apiUrl);

      // Extract fresh valid-for-1-hour download URL
      const freshUrl = spResponse["@microsoft.graph.downloadUrl"];

      results.push({
        fileID: file.ID,
        fileName,
        Reqno,
        Reqtype,
        Reqitem,
        mimeType:file.mediaType,
        url: freshUrl,     // ⭐ Always fresh URL
        permanentPath: spPath
      });
    }

    return results;

  } catch (err) {
    console.error("Error generating download URLs:", err);
    req.error(500, `Failed to generate download URLs: ${err.message}`);
  }
});




this.on("deleteAttachmentsFromSharePoint", async (req) => {
  try {
    const { data } = req.data;

    // Validate input
    if (!data || !Array.isArray(data) || data.length === 0) {
      return req.error(400, "Invalid input: 'data' array is required");
    }

    // 1️⃣ Connect to SharePoint once
    const domain = "smu.sharepoint.com";
    const siteName = "SAPFIN-DEV";
    const sharePoint = await cds.connect.to("sharepoint-fin");

    // Get Site ID
    const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
    const siteRes = await sharePoint.get(siteInfoUrl);
    const siteId = siteRes.id;

    // Overall tracking
    const results = [];
    let totalDeleted = 0;
    let totalFailed = 0;

    // 2️⃣ Process each deletion request
    for (const item of data) {
      const { Reqno, Reqtype, Reqitem, FileID } = item;

      // Validate required fields (Reqitem and FileID are optional)
      if (!Reqno || !Reqtype) {
        results.push({
          Reqno,
          Reqtype,
          Reqitem,
          FileID,
          status: "skipped",
          message: "Missing required fields (Reqno, Reqtype)",
          deletedFiles: [],
          failedFiles: []
        });
        continue;
      }

      // Determine if this is line-item or header level
      const isLineItemLevel = !!Reqitem;
      console.log(`📋 Delete mode: ${isLineItemLevel ? 'LINE ITEM' : 'HEADER'} level for ${Reqno}`);

      // Build WHERE clause based on level and FileID
      let whereClause;
      if (FileID) {
        // If FileID is provided, delete specific file
        whereClause = { ID: FileID };
        console.log(`🎯 Deleting specific file with FileID: ${FileID}`);
      } else {
        // Delete all files for the given criteria
        whereClause = isLineItemLevel
          ? { Reqno, Reqtype, Reqitem }
          : { Reqno, Reqtype };
        console.log(`🎯 Deleting all files for criteria`);
      }

      // Get attachments for this specific combination
      const attachments = await SELECT.from(AttachmentFiles).where(whereClause);

      if (!attachments.length) {
        results.push({
          Reqno,
          Reqtype,
          ...(isLineItemLevel && { Reqitem }),
          ...(FileID && { FileID }),
          status: "no_files",
          message: "No attachments found",
          deletedFiles: [],
          failedFiles: []
        });
        continue;
      }

      const successList = [];
      const failedList = [];

      // 3️⃣ Try deleting each file from SharePoint
      for (const file of attachments) {
        // Build SharePoint path based on level (INCLUDING FileID from DB)
        const sharePointFolder = isLineItemLevel
          ? `SMU_Attachments/${Reqtype}/${Reqno}/${Reqitem}/${file.ID}`
          : `SMU_Attachments/${Reqtype}/${Reqno}/${file.ID}`;

        const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/${sharePointFolder}/${file.fileName}`;

        try {
          await sharePoint.delete(deleteUrl);
          console.log(`✅ Deleted from SharePoint: ${file.fileName} (FileID: ${file.ID})`);
          successList.push({
            fileName: file.fileName,
            FileID: file.ID
          });
        } catch (err) {
          console.error(
            `❌ Failed to delete ${file.fileName} (FileID: ${file.ID}):`,
            err.message
          );
          failedList.push({
            fileName: file.fileName,
            FileID: file.ID,
            error: err.message
          });
        }
      }

      // 4️⃣ Delete ONLY successful items from DB
      if (successList.length > 0) {
        // Delete by FileID (ID) from successful list
        const successfulFileIDs = successList.map(f => f.FileID);
        
        await DELETE.from(AttachmentFiles).where({
          ID: { in: successfulFileIDs }
        });
      }

      // Track results for this item
      results.push({
        Reqno,
        Reqtype,
        ...(isLineItemLevel && { Reqitem }),
        ...(FileID && { FileID }),
        level: isLineItemLevel ? "LINE_ITEM" : "HEADER",
        status: successList.length > 0 ? "success" : "failed",
        deletedFiles: successList,
        failedFiles: failedList,
        message: `${successList.length} deleted, ${failedList.length} failed`
      });

      totalDeleted += successList.length;
      totalFailed += failedList.length;
    }

    // 5️⃣ Return comprehensive result
    return {
      summary: {
        totalProcessed: data.length,
        totalFilesDeleted: totalDeleted,
        totalFilesFailed: totalFailed
      },
      details: results
    };

  } catch (error) {
    console.error("Delete operation failed:", error);
    req.error(500, `Delete failed: ${error.message}`);
  }
});


//working fine without lineitem validation 
  // this.on("uploadFileToSharePoint", async (req) => {
  //   try {
  //     const { Reqno, Reqitem, Reqtype, file, fileName, mediaType } = req.data;

  //     // Validate mandatory fields
  //     if (!Reqno || !Reqitem || !Reqtype || !file || !fileName || !mediaType) {
  //       req.error(400, "All fields (Reqno, Reqitem, Reqtype, file, fileName, mediaType) are mandatory.");
  //     }

  //     // 1️⃣ Check if record exists in database
  //     const existingRecord = await SELECT.one.from(AttachmentFiles).where({
  //       Reqno,
  //       Reqitem,
  //       Reqtype
  //     });

  //     const isUpdate = !!existingRecord;
  //     let oldFileName = null;

  //     // If updating, store old filename for deletion
  //     if (isUpdate) {
  //       oldFileName = existingRecord.fileName;
  //       console.log(`📝 UPDATE mode: Existing file "${oldFileName}" will be replaced`);
  //     } else {
  //       console.log(`✨ CREATE mode: New file will be uploaded`);
  //     }

  //     // 2️⃣ Convert Base64 to binary
  //     const buffer = Buffer.from(file, "base64");

  //     // 3️⃣ Create temporary file folder
  //     const tempDir = path.join(__dirname, "attachments");
  //     fs.mkdirSync(tempDir, { recursive: true });
  //     const filePath = path.join(tempDir, fileName);
  //     fs.writeFileSync(filePath, buffer);

  //     const fileContent = fs.readFileSync(filePath);

  //     // 4️⃣ Connect to SharePoint
  //     const domain = "smu.sharepoint.com";
  //     const siteName = "SAPFIN-DEV";
  //     const sharePoint = await cds.connect.to("sharepoint-fin");

  //     // 5️⃣ Get Site ID
  //     const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
  //     const siteRes = await sharePoint.get(siteInfoUrl);
  //     const siteId = siteRes.id;

  //     // 6️⃣ If updating and filename changed, delete old file from SharePoint
  //     if (isUpdate && oldFileName && oldFileName !== fileName) {
  //       try {
  //         const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/SMU_Attachments/${Reqtype}/${Reqno}/${oldFileName}`;
  //         await sharePoint.delete(deleteUrl);
  //         console.log(`🗑️ Deleted old file from SharePoint: ${oldFileName}`);
  //       } catch (deleteError) {
  //         console.warn(`⚠️ Could not delete old file "${oldFileName}":`, deleteError.message);
  //         // Continue with upload even if delete fails
  //       }
  //     }

  //     // 7️⃣ Upload/Replace file to SharePoint
  //     const uploadUrl = `/v1.0/sites/${siteId}/drive/root:/SMU_Attachments/${Reqtype}/${Reqno}/${fileName}:/content`;
  //     const response = await sharePoint.put(uploadUrl, fileContent);

  //     // 8️⃣ Delete temp file
  //     fs.unlink(filePath, (err) => {
  //       if (err) console.error("Error deleting temp file:", err);
  //     });

  //     // 9️⃣ Get SharePoint download URL
  //     const downloadUrl = response["@microsoft.graph.downloadUrl"] || "";

  //     // 🔟 Update or Insert metadata in database
  //     if (isUpdate) {
  //       // UPDATE existing record
  //       await UPDATE(AttachmentFiles)
  //         .set({
  //           fileName,
  //           mediaType,
  //           fileSize: `${buffer.length} bytes`,
  //           url: downloadUrl,
  //           modifiedAt: new Date(),
  //           modifiedBy: req.user?.id || "SYSTEM"
  //         })
  //         .where({ Reqno, Reqitem, Reqtype });

  //       console.log(`✅ Updated database record for ${Reqno}-${Reqitem}-${Reqtype}`);
  //     } else {
  //       // INSERT new record
  //       await INSERT.into(AttachmentFiles).entries({
  //         Reqno,
  //         Reqitem,
  //         Reqtype,
  //         fileName,
  //         mediaType,
  //         fileSize: `${buffer.length} bytes`,
  //         url: downloadUrl,
  //         createdAt: new Date(),
  //         createdBy: req.user?.id || "SYSTEM"
  //       });

  //       console.log(`✅ Created new database record for ${Reqno}-${Reqitem}-${Reqtype}`);
  //     }

  //     // 1️⃣1️⃣ Return response with operation type
  //     return {
  //       operation: isUpdate ? "UPDATE" : "CREATE",
  //       url: downloadUrl,
  //       fileName: fileName,
  //       Reqno: Reqno,
  //       Reqitem: Reqitem,
  //       Reqtype: Reqtype,
  //       message: isUpdate
  //         ? `File updated successfully. Old file: "${oldFileName}", New file: "${fileName}"`
  //         : `File uploaded successfully: "${fileName}"`
  //     };

  //   } catch (error) {
  //     console.error("File upload/update failed:", error);
  //     req.error(500, `File upload/update failed: ${error.message}`);
  //   }
  // });



//working fine without lineitem validation 
  // this.on("deleteAttachmentsFromSharePoint", async (req) => {
  //   try {
  //     const { data } = req.data;

  //     // Validate input
  //     if (!data || !Array.isArray(data) || data.length === 0) {
  //       return req.error(400, "Invalid input: 'data' array is required");
  //     }

  //     // 1️⃣ Connect to SharePoint once
  //     const domain = "smu.sharepoint.com";
  //     const siteName = "SAPFIN-DEV";
  //     const sharePoint = await cds.connect.to("sharepoint-fin");

  //     // Get Site ID
  //     const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
  //     const siteRes = await sharePoint.get(siteInfoUrl);
  //     const siteId = siteRes.id;

  //     // Overall tracking
  //     const results = [];
  //     let totalDeleted = 0;
  //     let totalFailed = 0;

  //     // 2️⃣ Process each deletion request
  //     for (const item of data) {
  //       const { Reqno, Reqtype, Reqitem } = item;

  //       // Validate required fields
  //       if (!Reqno || !Reqtype || !Reqitem) {
  //         results.push({
  //           Reqno,
  //           Reqtype,
  //           Reqitem,
  //           status: "skipped",
  //           message: "Missing required fields",
  //           deletedFiles: [],
  //           failedFiles: []
  //         });
  //         continue;
  //       }

  //       // Get attachments for this specific combination
  //       const attachments = await SELECT.from(AttachmentFiles).where({
  //         Reqno,
  //         Reqtype,
  //         Reqitem
  //       });

  //       if (!attachments.length) {
  //         results.push({
  //           Reqno,
  //           Reqtype,
  //           Reqitem,
  //           status: "no_files",
  //           message: "No attachments found",
  //           deletedFiles: [],
  //           failedFiles: []
  //         });
  //         continue;
  //       }

  //       const successList = [];
  //       const failedList = [];

  //       // 3️⃣ Try deleting each file from SharePoint
  //       for (const file of attachments) {
  //         const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/SMU_Attachments/${Reqtype}/${Reqno}/${file.fileName}`;

  //         try {
  //           await sharePoint.delete(deleteUrl);
  //           console.log(`✅ Deleted from SharePoint: ${file.fileName}`);
  //           successList.push(file.fileName);
  //         } catch (err) {
  //           console.error(
  //             `❌ Failed to delete ${file.fileName}:`,
  //             err.message
  //           );
  //           failedList.push({
  //             fileName: file.fileName,
  //             error: err.message
  //           });
  //         }
  //       }

  //       // 4️⃣ Delete ONLY successful items from DB
  //       if (successList.length > 0) {
  //         await DELETE.from(AttachmentFiles).where({
  //           Reqno,
  //           Reqtype,
  //           Reqitem,
  //           fileName: { in: successList }
  //         });
  //       }

  //       // Track results for this item
  //       results.push({
  //         Reqno,
  //         Reqtype,
  //         Reqitem,
  //         status: successList.length > 0 ? "success" : "failed",
  //         deletedFiles: successList,
  //         failedFiles: failedList,
  //         message: `${successList.length} deleted, ${failedList.length} failed`
  //       });

  //       totalDeleted += successList.length;
  //       totalFailed += failedList.length;
  //     }

  //     // 5️⃣ Return comprehensive result
  //     return {
  //       summary: {
  //         totalProcessed: data.length,
  //         totalFilesDeleted: totalDeleted,
  //         totalFilesFailed: totalFailed
  //       },
  //       details: results
  //     };

  //   } catch (error) {
  //     console.error("Delete operation failed:", error);
  //     req.error(500, `Delete failed: ${error.message}`);
  //   }
  // });


 



});
