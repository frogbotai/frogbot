import * as module from '@activepieces/piece-attio';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const attioActions = ['create_record', 'update_record', 'find_record', 'get_record', 'create_note', 'create_task'] as const;
export const attioScopes = [] as const;

export function createAttio(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "attio",
    credentialType: "secret_text",
    defaultActions: attioActions,
    scopes: attioScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Record: Creates a new record such as peron,company or deal. */
    createRecord: piece.tool("create_record"),
    /** Update Record: Update an existing record with new attribute values. */
    updateRecord: piece.tool("update_record"),
    /** Find Record: Search for records in Attio using filters and return matching results. */
    findRecord: piece.tool("find_record"),
    /** Get Record: Retrieve a single record by ID and return its normalized attribute values. */
    getRecord: piece.tool("get_record"),
    /** Create List Entry: Add a record to a specified list. */
    createEntry: piece.tool("create_entry"),
    /** Update List Entry: Update the attributes of an existing entry in a list. */
    updateEntry: piece.tool("update_entry"),
    /** Find List Entry: Search for entries in a specific list in Attio using filters and return matching results. */
    findListEntry: piece.tool("find_list_entry"),
    /** Create Note: Creates a new note on a record. */
    createNote: piece.tool("create_note"),
    /** Get Call Transcript: Fetches the full transcript for a given call recording. */
    getCallTranscript: piece.tool("get_call_transcript"),
    /** Create Task: Create a new task in Attio, optionally linked to a record and assigned to a member. */
    createTask: piece.tool("create_task"),
    /** List Tasks: List tasks with optional filters by linked record, assignee, or completion status. */
    listTasks: piece.tool("list_tasks"),
    /** Get Task: Fetch a single task by its ID. */
    getTask: piece.tool("get_task"),
    /** Delete Task: Permanently delete a task by its ID. */
    deleteTask: piece.tool("delete_task"),
    /** Update Task: Update an existing task in Attio. */
    updateTask: piece.tool("update_task"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
