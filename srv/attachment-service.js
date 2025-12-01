const cds = require('@sap/cds');
const fs = require('fs');
const path = require('path');


module.exports = cds.service.impl(async function () {
  const { AttachmentFiles } = this.entities;
  const sharePoint = await cds.connect.to("sharepoint-fin");
  const domain = "smu.sharepoint.com";
  const siteName = "SAPFIN-DEV";

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

      if (isUpdate) {
        oldRecord = await SELECT.one.from(AttachmentFiles).where({ ID });
        if (!oldRecord) req.error(404, `Record with FileID ${ID} not found`);
      } else {
        const { uuid } = cds.utils;
        ID = uuid();
      }

      const buffer = Buffer.from(file, "base64");

      const tempDir = path.join(__dirname, "attachments");
      fs.mkdirSync(tempDir, { recursive: true });
      const tempFilePath = path.join(tempDir, fileName);
      fs.writeFileSync(tempFilePath, buffer);

      const fileContent = fs.readFileSync(tempFilePath);

      const siteInfoUrl = `/v1.0/sites/${domain}:/sites/${siteName}`;
      const siteRes = await sharePoint.get(siteInfoUrl);
      const siteId = siteRes.id;

      const driveRes = await sharePoint.get(`/v1.0/sites/${siteId}/drive`);
      const driveId = driveRes.id;


      const dotIndex = fileName.lastIndexOf(".");
      const namePart = fileName.substring(0, dotIndex);      // finance
      const extPart = fileName.substring(dotIndex);          // .png

      const spFileName = `${namePart}_${ID}${extPart}`;

      const spFolder = `BTPApp/${Reqtype}`;
      const spPath = `${spFolder}/${spFileName}`;

      const uploadUrl = `/v1.0/sites/${siteId}/drive/root:/${spPath}:/content`;

      if (isUpdate && oldRecord?.spPath) {
        try {
          const deleteUrl = `/v1.0/sites/${siteId}/drive/root:/${oldRecord.spPath}`;
          await sharePoint.delete(deleteUrl);
        } catch (err) {
          console.warn("⚠ Old file delete failed:", err.message);
        }
      }

      const response = await sharePoint.put(uploadUrl, fileContent);

      fs.unlink(tempFilePath, () => { });

      const downloadUrl = response["@microsoft.graph.downloadUrl"] || "";
      const record = {
        fileName,      
        mediaType,
        url: downloadUrl,
        siteId,
        driveId,
        spPath
      };

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
        let whereClause = {};
        if (FileID) {
          whereClause = { ID: FileID };
        } else {
          whereClause = isLineItemLevel
            ? { Reqno, Reqtype, Reqitem }
            : { Reqno, Reqtype };
        }

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
