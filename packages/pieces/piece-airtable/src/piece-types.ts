export interface AirtableTypes {
  auth: {
    personalAccessToken: string;
  };
  options: {};
  actions: {
    createRecord: {
      input: {
        baseId: string;
        tableId: string;
        fields: {
          [k: string]: unknown;
        };
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    };
    findRecords: {
      input: {
        baseId: string;
        tableId: string;
        searchField: string;
        searchValue: string;
        viewId?: string;
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      }[];
    };
    updateRecord: {
      input: {
        baseId: string;
        tableId: string;
        recordId: string;
        fields: {
          [k: string]: unknown;
        };
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    };
    cleanRecord: {
      input: {
        baseId: string;
        tableId: string;
        recordId: string;
        fields: {
          [k: string]: unknown;
        };
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    };
    deleteRecord: {
      input: {
        baseId: string;
        tableId: string;
        recordId: string;
      };
      output: {
        id: string;
        deleted: boolean;
        [k: string]: unknown;
      };
    };
    uploadAttachment: {
      input: {
        baseId: string;
        tableId: string;
        recordId: string;
        attachmentFieldId: string;
        fileId: string | number;
        contentType: string;
        filename?: string;
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    };
    addRecordComment: {
      input: {
        baseId: string;
        tableId: string;
        recordId: string;
        text: string;
        parentCommentId?: string;
      };
      output: {
        id: string;
        text: string;
        createdTime: string;
        lastUpdatedTime?: string | null;
        parentCommentId?: string;
        [k: string]: unknown;
      };
    };
    createBase: {
      input: {
        workspaceId: string;
        name: string;
        /**
         * @minItems 1
         */
        tables: [
          {
            name: string;
            description?: string;
            /**
             * @minItems 1
             */
            fields: [
              {
                name: string;
                type: string;
                description?: string;
                options?: unknown;
                [k: string]: unknown;
              },
              ...{
                name: string;
                type: string;
                description?: string;
                options?: unknown;
                [k: string]: unknown;
              }[],
            ];
          },
          ...{
            name: string;
            description?: string;
            /**
             * @minItems 1
             */
            fields: [
              {
                name: string;
                type: string;
                description?: string;
                options?: unknown;
                [k: string]: unknown;
              },
              ...{
                name: string;
                type: string;
                description?: string;
                options?: unknown;
                [k: string]: unknown;
              }[],
            ];
          }[],
        ];
      };
      output: {
        id: string;
        tables: {
          id: string;
          name: string;
          description?: string;
          primaryFieldId?: string;
          fields: {
            id?: string;
            name: string;
            type: string;
            description?: string;
            options?: unknown;
            [k: string]: unknown;
          }[];
          views?: {
            id: string;
            name: string;
            type?: string;
            [k: string]: unknown;
          }[];
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      };
    };
    createTable: {
      input: {
        baseId: string;
        name: string;
        description?: string;
        /**
         * @minItems 1
         */
        fields: [
          {
            name: string;
            type: string;
            description?: string;
            options?: unknown;
            [k: string]: unknown;
          },
          ...{
            name: string;
            type: string;
            description?: string;
            options?: unknown;
            [k: string]: unknown;
          }[],
        ];
      };
      output: {
        id: string;
        name: string;
        description?: string;
        primaryFieldId?: string;
        fields: {
          id?: string;
          name: string;
          type: string;
          description?: string;
          options?: unknown;
          [k: string]: unknown;
        }[];
        views?: {
          id: string;
          name: string;
          type?: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      };
    };
    findBases: {
      input: {
        name: string;
      };
      output: {
        id: string;
        name: string;
        permissionLevel?: string;
        workspaceId?: string;
        [k: string]: unknown;
      }[];
    };
    getTable: {
      input: {
        baseId: string;
        tableId: string;
      };
      output: {
        id: string;
        name: string;
        description?: string;
        primaryFieldId?: string;
        fields: {
          id?: string;
          name: string;
          type: string;
          description?: string;
          options?: unknown;
          [k: string]: unknown;
        }[];
        views?: {
          id: string;
          name: string;
          type?: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      };
    };
    getRecord: {
      input: {
        baseId: string;
        tableId: string;
        recordId: string;
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    };
    findTable: {
      input: {
        baseId: string;
        name: string;
      };
      output: {
        id: string;
        name: string;
        description?: string;
        primaryFieldId?: string;
        fields: {
          id?: string;
          name: string;
          type: string;
          description?: string;
          options?: unknown;
          [k: string]: unknown;
        }[];
        views?: {
          id: string;
          name: string;
          type?: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      } | null;
    };
    getBaseSchema: {
      input: {
        baseId: string;
      };
      output: {
        id: string;
        name: string;
        description?: string;
        primaryFieldId?: string;
        fields: {
          id?: string;
          name: string;
          type: string;
          description?: string;
          options?: unknown;
          [k: string]: unknown;
        }[];
        views?: {
          id: string;
          name: string;
          type?: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      }[];
    };
    customApiCall: {
      input: {
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        path: string;
        query?: {
          [k: string]: string | number | boolean;
        };
        body?: unknown;
      };
      output: unknown;
    };
  };
  triggers: {
    newRecord: {
      input: {
        baseId: string;
        tableId: string;
        viewId?: string;
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    };
    newOrUpdatedRecord: {
      input: {
        baseId: string;
        tableId: string;
        viewId?: string;
        modifiedTimeField: string;
      };
      output: {
        id: string;
        createdTime?: string;
        fields: {
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    };
  };
}
