namespace smu.attachments;
using {cuid, managed} from '@sap/cds/common.cds';

entity AttachmentFiles : cuid, managed {

    Reqno        : String(25);     // ABAP: Request Number
    Reqitem      : String(10);     // ABAP: Request Item
    Reqtype      : String(20);     // ABAP: Request Type
    
    fileName    : String;
    mediaType   : String;
   
    url         : String;     // SharePoint file URL

    // ⭐ Added fields for regenerating download URLs
    siteId      : String;     // SharePoint Site ID
    driveId     : String;     // SharePoint Drive ID
    spPath      : String;     // Path where file is stored
}
