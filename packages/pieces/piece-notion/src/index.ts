import * as module from "@activepieces/piece-notion";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const notionActions = [
  "list_databases",
  "create_database_item",
  "update_database_item",
  "notion-find-database-item",
  "list_database_pages",
  "createPage",
  "append_to_page",
  "getPageOrBlockChildren",
  "add_comment",
  "find_page",
] as const;
export const notionScopes = [] as const;

export function createNotion(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "notion",
    credentialType: "oauth2",
    defaultActions: notionActions,
    scopes: notionScopes,
    config,
  });
  return Object.assign(piece, {
    /** List Databases: Lists Notion databases accessible by the connected account with pagination support. */
    listDatabases: piece.tool("list_databases"),
    /** Create Database Item: Add a new item to a Notion database with custom field values and optional content. Ideal for creating tasks, records, or entries in structured databases. */
    createDatabaseItem: piece.tool("create_database_item"),
    /** Update Database Item: Update specific fields in a Notion database item. Perfect for maintaining data, tracking changes, or syncing information across systems. */
    updateDatabaseItem: piece.tool("update_database_item"),
    /** Find Database Item: Searches for an item in database by field. */
    notionFindDatabaseItem: piece.tool("notion-find-database-item"),
    /** List Pages: Lists pages in a Notion database with optional field filters and pagination. */
    listDatabasePages: piece.tool("list_database_pages"),
    /** Create Page: Create a new Notion page as a sub-page with custom title and content. Perfect for organizing documentation, notes, or creating structured page hierarchies. */
    createPage: piece.tool("createPage"),
    /** Append to Page: Appends content to the end of a page. */
    appendToPage: piece.tool("append_to_page"),
    /** Get block content: Retrieve the actual content of a page (represented by blocks). */
    getPageOrBlockChildren: piece.tool("getPageOrBlockChildren"),
    /** Archive Database Item: Archive (soft-delete) a database item without permanently removing it. Archived items can be restored later if needed. */
    archiveDatabaseItem: piece.tool("archive_database_item"),
    /** Restore Database Item: Restore an archived database item back to active status. Perfect for recovering accidentally archived tasks, projects, or records. */
    restoreDatabaseItem: piece.tool("restore_database_item"),
    /** Add Comment: Add a comment to any Notion page to start discussions, provide feedback, or leave notes for team collaboration. */
    addComment: piece.tool("add_comment"),
    /** Retrieve Database Structure: Get detailed information about a Notion database including all its properties, field types, and configuration. Perfect for building dynamic forms, validation rules, or understanding database schemas. */
    retrieveDatabase: piece.tool("retrieve_database"),
    /** Get Page Comments: Retrieve all comments from a Notion page, organized by discussion threads. Perfect for tracking feedback, managing reviews, or monitoring page discussions. */
    getPageComments: piece.tool("get_page_comments"),
    /** Find Page: Search for Notion pages by title with flexible matching options. Perfect for finding specific pages, building page references, or creating automated workflows based on page discovery. */
    findPage: piece.tool("find_page"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
