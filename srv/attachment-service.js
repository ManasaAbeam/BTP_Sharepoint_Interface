const cds = require('@sap/cds');
const fs = require('fs');
const path = require('path');


module.exports = cds.service.impl(async function () {
  const { AttachmentFiles } = this.entities;
  const sharePoint = await cds.connect.to("sharepoint-fin");
  const domain = "smu.sharepoint.com";
  const siteName = "SAPFIN-DEV";

  // this.on("uploadFileToSharePoint", async (req) => {
  //   try {
  //     const { FileID, Reqno, Reqitem, Reqtype, file, fileName, mediaType } = req.data;
  //     let ID = FileID;
  //     if (!Reqno || !Reqtype || !file || !fileName || !mediaType) {
  //       req.error(400, "Fields Reqno, Reqtype, file, fileName, and mediaType are mandatory.");
  //     }

  //     // Determine if this is line-item or header level
  //     const isLineItemLevel = !!Reqitem;
  //     console.log(`📋 Upload mode: ${isLineItemLevel ? 'LINE ITEM' : 'HEADER'} level`);

  //     // Determine if this is CREATE or UPDATE based on FileID
  //     const isUpdate = !!FileID;
  //     let existingRecord = null;
  //     let oldFileName = null;
  //     let oldFileID = null;

  //     if (isUpdate) {
  //       existingRecord = await SELECT.one.from(AttachmentFiles).where({ ID });
  //       if (!existingRecord) {
  //         req.error(404, `Record with FileID "${FileID}" not found`);
  //       }

  //       oldFileName = existingRecord.fileName;
  //       oldFileID = existingRecord.ID;
  //       console.log(`UPDATE mode: Existing file "${oldFileName}" will be replaced (FileID: ${FileID})`);
  //     } else {
  //       const { uuid } = cds.utils;
  //       ID = uuid();
  //       console.log(`CREATE mode: New file will be uploaded (FileID: ${ID})`);
  //     }

  //     const buffer = Buffer.from(file, "base64");

  //     // Create temporary file folder
  //     const tempDir = path.join(__dirname, "attachments");
  //     fs.mkdirSync(tempDir, { recursive: true });
  //     const filePath = path.join(tempDir, fileName);
  //     fs.writeFileSync(filePath, buffer);

  //     const fileContent = fs.readFileSync(filePath);

  //     // Get Site ID
  //     const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
  //     const siteRes = await sharePoint.get(siteInfoUrl);
  //     const siteId = siteRes.id;

  //     // Get driveId of default document library
  //     const driveRes = await sharePoint.get(`/v1.0/sites/${siteId}/drive`);
  //     const driveId = driveRes.id;


  //     // Build SharePoint path based on level (INCLUDING FileID)
  //     const sharePointFolder = isLineItemLevel
  //       ? `SMU_Attachments/${Reqtype}/${Reqno}/${Reqitem}/${ID}`
  //       : `SMU_Attachments/${Reqtype}/${Reqno}/${ID}`;

  //     const permanentSpPath = `${sharePointFolder}/${fileName}`;

  //     console.log(`📁 SharePoint folder: ${sharePointFolder}`);

  //     // If updating and (filename changed OR FileID path changed), delete old file from SharePoint
  //     if (isUpdate && oldFileName && oldFileID) {
  //       try {
  //         // Build old SharePoint path
  //         const oldSharePointFolder = isLineItemLevel
  //           ? `SMU_Attachments/${Reqtype}/${Reqno}/${Reqitem}/${oldFileID}`
  //           : `SMU_Attachments/${Reqtype}/${Reqno}/${oldFileID}`;

  //         const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/${oldSharePointFolder}/${oldFileName}`;
  //         await sharePoint.delete(deleteUrl);
  //         console.log(`🗑️ Deleted old file from SharePoint: ${oldFileName} (FileID: ${oldFileID})`);
  //       } catch (deleteError) {
  //         console.warn(`⚠️ Could not delete old file "${oldFileName}":`, deleteError.message);

  //       }
  //     }

  //     // Upload/Replace file to SharePoint (with FileID in path)
  //     const uploadUrl = `/v1.0/sites/${siteId}/drive/root:/${sharePointFolder}/${fileName}:/content`;
  //     const response = await sharePoint.put(uploadUrl, fileContent);
  //     console.log("sharepoint response",response)

  //     //  Delete temp file
  //     fs.unlink(filePath, (err) => {
  //       if (err) console.error("Error deleting temp file:", err);
  //     });

  //     //  Get SharePoint download URL
  //     const downloadUrl = response["@microsoft.graph.downloadUrl"] || "";

  //     //  Prepare database record
  //     const dbRecord = {
  //       fileName,
  //       mediaType,
  //       url: downloadUrl,

  //       siteId: siteId,
  //       driveId: driveId,
  //       spPath: permanentSpPath
  //     };

  //     //  Update or Insert metadata in database
  //     if (isUpdate) {
  //       await UPDATE(AttachmentFiles)
  //         .set({
  //           ...dbRecord,
  //           modifiedAt: new Date(),
  //           modifiedBy: req.user?.id || "SYSTEM"
  //         })
  //         .where({ ID });

  //       console.log(`Updated database record (FileID: ${ID})`);
  //     } else {

  //       const insertData = {
  //         ID: ID,
  //         Reqno,
  //         Reqtype,
  //         ...dbRecord,
  //         createdAt: new Date(),
  //         createdBy: req.user?.id || "SYSTEM"
  //       };

  //       // Only add Reqitem if it's line-item level
  //       if (isLineItemLevel) {
  //         insertData.Reqitem = Reqitem;
  //       }

  //       await INSERT.into(AttachmentFiles).entries(insertData);

  //       console.log(`Created new database record (FileID: ${ID})`);
  //     }
  //     return {
  //       FileID: ID,
  //       operation: isUpdate ? "UPDATE" : "CREATE",
  //       level: isLineItemLevel ? "LINE_ITEM" : "HEADER",
  //       url: downloadUrl,
  //       fileName: fileName,
  //       Reqno: Reqno,
  //       ...(isLineItemLevel && { Reqitem: Reqitem }),
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

  this.on("uploadFileToSharePoint", async (req) => {
    try {
      const { FileID, Reqno, Reqitem, Reqtype, file, fileName, mediaType } = req.data;

      if (!Reqno || !Reqtype || !file || !fileName || !mediaType) {
        req.error(400, "Fields Reqno, Reqtype, file, fileName, and mediaType are mandatory.");
      }

      const isLineItem = !!Reqitem;
      const isUpdate = !!FileID;
      let ID = FileID;

      let oldRecord = null;

      // -----------------------------------------------------
      // FETCH OLD DATA IF UPDATE
      // -----------------------------------------------------
      if (isUpdate) {
        oldRecord = await SELECT.one.from(AttachmentFiles).where({ ID });
        if (!oldRecord) req.error(404, `Record with FileID ${ID} not found`);
      } else {
        const { uuid } = cds.utils;
        ID = uuid();
      }

      // -----------------------------------------------------
      // CONVERT BASE64 → BUFFER
      // -----------------------------------------------------
      const buffer = Buffer.from(file, "base64");

      // Temp saving (required by SharePoint upload)
      const tempDir = path.join(__dirname, "attachments");
      fs.mkdirSync(tempDir, { recursive: true });
      const tempFilePath = path.join(tempDir, fileName);
      fs.writeFileSync(tempFilePath, buffer);

      const fileContent = fs.readFileSync(tempFilePath);

      // -----------------------------------------------------
      // GET SHAREPOINT SITE + DRIVE
      // -----------------------------------------------------
      const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
      const siteRes = await sharePoint.get(siteInfoUrl);
      const siteId = siteRes.id;

      const driveRes = await sharePoint.get(`/v1.0/sites/${siteId}/drive`);
      const driveId = driveRes.id;

      // -----------------------------------------------------
      // BUILD spFileName: finance_UUID.png
      // -----------------------------------------------------
      const dotIndex = fileName.lastIndexOf(".");
      const namePart = fileName.substring(0, dotIndex);      // finance
      const extPart = fileName.substring(dotIndex);          // .png

      const spFileName = `${namePart}_${ID}${extPart}`;

      // -----------------------------------------------------
      // SHAREPOINT PATH: BTPApp/<Reqtype>/<spFileName>
      // -----------------------------------------------------
      const spFolder = `BTPApp/${Reqtype}`;
      const spPath = `${spFolder}/${spFileName}`;

      const uploadUrl = `/v1.0/sites/${siteId}/drive/root:/${spPath}:/content`;

      // -----------------------------------------------------
      // DELETE OLD FILE IF UPDATE
      // -----------------------------------------------------
      if (isUpdate && oldRecord?.spPath) {
        try {
          const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/${oldRecord.spPath}`;
          await sharePoint.delete(deleteUrl);
        } catch (err) {
          console.warn("⚠ Old file delete failed:", err.message);
        }
      }

      // -----------------------------------------------------
      // UPLOAD NEW FILE
      // -----------------------------------------------------
      const response = await sharePoint.put(uploadUrl, fileContent);

      // Delete local temp file
      fs.unlink(tempFilePath, () => { });

      const downloadUrl = response["@microsoft.graph.downloadUrl"] || "";

      // -----------------------------------------------------
      // PREPARE DB METADATA
      // -----------------------------------------------------
      const record = {
        fileName,      // original file name

        mediaType,
        url: downloadUrl,
        siteId,
        driveId,
        spPath
      };

      // -----------------------------------------------------
      // UPDATE OR INSERT IN DB
      // -----------------------------------------------------
      if (isUpdate) {
        const updateRecord = {
          fileName,
          mediaType,
          url: downloadUrl,
          siteId,
          driveId,
          spPath,
          modifiedAt: new Date(),
          modifiedBy: req.user?.id || "SYSTEM",
          Reqno,
          Reqtype
        };

        if (isLineItem) updateRecord.Reqitem = Reqitem;

        await UPDATE(AttachmentFiles)
          .set(updateRecord)
          .where({ ID });
      }
      else {
        const insertData = {
          ID,
          Reqno,
          Reqtype,
          ...record,
        };

        if (isLineItem) insertData.Reqitem = Reqitem;

        await INSERT.into(AttachmentFiles).entries(insertData);
      }

      // -----------------------------------------------------
      // RETURN RESPONSE
      // -----------------------------------------------------
      return {
        FileID: ID,
        fileName,
        spPath,
        url: downloadUrl,
        Reqno,
        Reqtype,
        ...(isLineItem && { Reqitem }),
        operation: isUpdate ? "UPDATE" : "CREATE",
        message: isUpdate ? "File updated successfully" : "File uploaded successfully"
      };

    } catch (error) {
      console.error(error);
      req.error(500, `Upload failed: ${error.message}`);
    }
  });


  this.on("DownloadFiles", async (req) => {
    try {
      const { Reqno, Reqtype } = req.data;

      const attachments = await SELECT.from(AttachmentFiles).where({
        Reqno,
        Reqtype
      });

      if (!attachments.length) {
        req.error(404, `No attachments found for ${Reqtype}/${Reqno}`);
      }

      const results = [];

      for (const file of attachments) {
        const { siteId, driveId, spPath, fileName, Reqitem } = file;

        if (!siteId || !driveId || !spPath) {
          console.warn(`⚠️ Missing SharePoint metadata for ID: ${file.ID}`);
          continue;
        }

        const apiUrl = `/v1.0/sites/${siteId}/drives/${driveId}/root:/${spPath}`;
        const spResponse = await sharePoint.get(apiUrl);

        console.log("sharepoint response", spResponse)

        const freshUrl = spResponse["@microsoft.graph.downloadUrl"];

        results.push({
          fileID: file.ID,
          fileName,
          Reqno,
          Reqtype,
          Reqitem,
          mimeType: file.mediaType,
          url: freshUrl,
          permanentPath: spPath
        });
      }

      return results;

    } catch (err) {
      console.error("Error generating download URLs:", err);
      req.error(500, `Failed to generate download URLs: ${err.message}`);
    }
  });



  // this.on("deleteAttachmentsFromSharePoint", async (req) => {
  //   try {
  //     const { data } = req.data;

  //     if (!data || !Array.isArray(data) || data.length === 0) {
  //       return req.error(400, "Invalid input: 'data' array is required");
  //     }

  //     const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
  //     const siteRes = await sharePoint.get(siteInfoUrl);
  //     const siteId = siteRes.id;

  //     const results = [];
  //     let totalDeleted = 0;
  //     let totalFailed = 0;

  //     for (const item of data) {
  //       const { Reqno, Reqtype, Reqitem, FileID } = item;

  //       if (!Reqno || !Reqtype) {
  //         results.push({
  //           Reqno,
  //           Reqtype,
  //           Reqitem,
  //           FileID,
  //           status: "skipped",
  //           message: "Missing required fields (Reqno, Reqtype)",
  //           deletedFiles: [],
  //           failedFiles: []
  //         });
  //         continue;
  //       }

  //       const isLineItemLevel = !!Reqitem;
  //       console.log(`Delete mode: ${isLineItemLevel ? 'LINE ITEM' : 'HEADER'} level for ${Reqno}`);

  //       let whereClause;
  //       if (FileID) {
  //         whereClause = { ID: FileID };
  //         console.log(`Deleting specific file with FileID: ${FileID}`);
  //       } else {
  //         whereClause = isLineItemLevel
  //           ? { Reqno, Reqtype, Reqitem }
  //           : { Reqno, Reqtype };
  //         console.log(`Deleting all files for criteria`);
  //       }

  //       const attachments = await SELECT.from(AttachmentFiles).where(whereClause);

  //       if (!attachments.length) {
  //         results.push({
  //           Reqno,
  //           Reqtype,
  //           ...(isLineItemLevel && { Reqitem }),
  //           ...(FileID && { FileID }),
  //           status: "no_files",
  //           message: "No attachments found",
  //           deletedFiles: [],
  //           failedFiles: []
  //         });
  //         continue;
  //       }

  //       const successList = [];
  //       const failedList = [];

  //       for (const file of attachments) {
  //         const sharePointFolder = isLineItemLevel
  //           ? `SMU_Attachments/${Reqtype}/${Reqno}/${Reqitem}/${file.ID}`
  //           : `SMU_Attachments/${Reqtype}/${Reqno}/${file.ID}`;

  //         const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/${sharePointFolder}/${file.fileName}`;

  //         try {
  //           await sharePoint.delete(deleteUrl);
  //           console.log(`Deleted from SharePoint: ${file.fileName} (FileID: ${file.ID})`);
  //           successList.push({
  //             fileName: file.fileName,
  //             FileID: file.ID
  //           });
  //         } catch (err) {
  //           console.error(
  //             `Failed to delete ${file.fileName} (FileID: ${file.ID}):`,
  //             err.message
  //           );
  //           failedList.push({
  //             fileName: file.fileName,
  //             FileID: file.ID,
  //             error: err.message
  //           });
  //         }
  //       }


  //       if (successList.length > 0) {

  //         const successfulFileIDs = successList.map(f => f.FileID);

  //         await DELETE.from(AttachmentFiles).where({
  //           ID: { in: successfulFileIDs }
  //         });
  //       }

  //       results.push({
  //         Reqno,
  //         Reqtype,
  //         ...(isLineItemLevel && { Reqitem }),
  //         ...(FileID && { FileID }),
  //         level: isLineItemLevel ? "LINE_ITEM" : "HEADER",
  //         status: successList.length > 0 ? "success" : "failed",
  //         deletedFiles: successList,
  //         failedFiles: failedList,
  //         message: `${successList.length} deleted, ${failedList.length} failed`
  //       });

  //       totalDeleted += successList.length;
  //       totalFailed += failedList.length;
  //     }

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


  this.on("deleteAttachmentsFromSharePoint", async (req) => {
    try {
      const { data } = req.data;

      if (!data || !Array.isArray(data) || data.length === 0) {
        return req.error(400, "Invalid input: 'data' array is required");
      }

      // Fetch Site ID
      const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
      const siteRes = await sharePoint.get(siteInfoUrl);
      const siteId = siteRes.id;

      const results = [];
      let totalDeleted = 0;
      let totalFailed = 0;

      for (const item of data) {
        const { Reqno, Reqtype, Reqitem, FileID } = item;

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

        const isLineItemLevel = !!Reqitem;

        // Build WHERE clause dynamically
        let whereClause = {};
        if (FileID) {
          whereClause = { ID: FileID };
        } else {
          whereClause = isLineItemLevel
            ? { Reqno, Reqtype, Reqitem }
            : { Reqno, Reqtype };
        }

        // Get all attachments to delete
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

        for (const file of attachments) {
          if (!file.spPath) {
            failedList.push({
              FileID: file.ID,
              fileName: file.fileName,
              error: "Missing spPath in DB"
            });
            continue;
          }

          // spPath example: BTPApp/FAD/finance_1234.png
          const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/${file.spPath}`;

          try {
            await sharePoint.delete(deleteUrl);

            successList.push({
              FileID: file.ID,
              fileName: file.fileName
            });
          } catch (err) {
            failedList.push({
              FileID: file.ID,
              fileName: file.fileName,
              error: err.message
            });
          }
        }

        // Delete DB rows for successfully deleted files
        if (successList.length > 0) {
          await DELETE.from(AttachmentFiles).where({
            ID: { in: successList.map(f => f.FileID) }
          });
        }

        results.push({
          Reqno,
          Reqtype,
          ...(isLineItemLevel && { Reqitem }),
          ...(FileID && { FileID }),
          status: successList.length > 0 ? "success" : "failed",
          deletedFiles: successList,
          failedFiles: failedList,
          message: `${successList.length} deleted, ${failedList.length} failed`
        });

        totalDeleted += successList.length;
        totalFailed += failedList.length;
      }

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


});
