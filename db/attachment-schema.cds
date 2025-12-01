namespace smu.attachments;

using {
    cuid,
    managed
} from '@sap/cds/common.cds';

entity AttachmentFiles : cuid, managed {

    Reqno     : String(25);
    Reqitem   : String(10);
    Reqtype   : String(20);
    fileName  : String;
    mediaType : String;
    url       : String;
    siteId    : String;
    driveId   : String;
    spPath    : String;

}
