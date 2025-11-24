using {smu.attachments as db} from '../db/attachment-schema';

service AttachmentService {
    entity AttachmentFiles as projection on db.AttachmentFiles;


    action   uploadFileToSharePoint(Reqno: String,
                                    Reqitem: String,
                                    Reqtype: String,
                                    file: LargeBinary,
                                    FileID: UUID,
                                    fileName: String,
                                    mediaType: String)                   returns many String;


    function DownloadFiles(Reqno: String, Reqtype: String)               returns many String;

    type DeleteInput {
        Reqno   : String;
        Reqtype : String;
        Reqitem : String;
        FileID  : UUID
    }

    action   deleteAttachmentsFromSharePoint(data: array of DeleteInput) returns String;


}
