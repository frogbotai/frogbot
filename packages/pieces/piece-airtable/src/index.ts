import * as module from '@activepieces/piece-airtable';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const airtableActions = ['airtable_create_record', 'airtable_find_record', 'airtable_update_record', 'airtable_delete_record', 'airtable_add_comment_to_record', 'airtable_get_record_by_id'] as const;
export const airtableScopes = [] as const;

export function createAirtable(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "airtable",
    credentialType: "secret_text",
    defaultActions: airtableActions,
    scopes: airtableScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Airtable Record: Adds a record into an airtable */
    airtableCreateRecord: piece.tool("airtable_create_record"),
    /** Find Airtable Record: Find a record in airtable */
    airtableFindRecord: piece.tool("airtable_find_record"),
    /** Update Airtable Record: Update a record in airtable */
    airtableUpdateRecord: piece.tool("airtable_update_record"),
    /** Clean Record: Clears fields in a record. Empty values will clear the corresponding fields. */
    airtableCleanRecord: piece.tool("airtable_clean_record"),
    /** Delete Airtable Record: Deletes a record in airtable */
    airtableDeleteRecord: piece.tool("airtable_delete_record"),
    /** Upload File to Column: Uploads a file to attachment type column. */
    airtableUploadFileToColumn: piece.tool("airtable_upload_file_to_column"),
    /** Add Comment to Record: Adds a comment to an existing record. */
    airtableAddCommentToRecord: piece.tool("airtable_add_comment_to_record"),
    /** Create Base: Create a new base with a specified table structure. */
    airtableCreateBase: piece.tool("airtable_create_base"),
    /** Create Table: Create a new table in an existing base. */
    airtableCreateTable: piece.tool("airtable_create_table"),
    /** Find Base: Find a base by its name or a keyword. */
    airtableFindBase: piece.tool("airtable_find_base"),
    /** Find Table by ID: Get a table's details and schema using its ID. */
    airtableFindTableById: piece.tool("airtable_find_table_by_id"),
    /** Get Record by ID: Retrieve a single record from a table by its unique ID. */
    airtableGetRecordById: piece.tool("airtable_get_record_by_id"),
    /** Find Table: Find a table in a given base by its name. */
    airtableFindTable: piece.tool("airtable_find_table"),
    /** Get Base Schema: Retrieve the schema for a specific base, including all its tables and fields. */
    airtableGetBaseSchema: piece.tool("airtable_get_base_schema"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
