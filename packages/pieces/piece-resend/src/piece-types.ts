export interface ResendTypes {
  auth: {
    apiKey: string;
  };
  options: {
    from?: {
      address: string;
      name?: string;
    };
  };
  actions: {
    send: {
      input: {
        to: string[];
        from_name: string;
        from: string;
        bcc?: string[];
        cc?: string[];
        reply_to?: string;
        subject: string;
        content_type: 'html' | 'text';
        content: string;
        scheduled_at?: string;
      };
      output: unknown;
    };
    sendBatchEmails: {
      input: {
        emails: {
          from: string;
          to: string;
          subject: string;
          content_type: 'html' | 'text';
          content: string;
          reply_to?: string;
          cc?: string;
          bcc?: string;
        }[];
        idempotency_key?: string;
      };
      output: unknown;
    };
    getEmailStatus: {
      input: {
        email_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    listEmails: {
      input: {};
      output: unknown;
    };
    cancelScheduledEmail: {
      input: {
        email_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    rescheduleEmail: {
      input: {
        email_id: string;
        scheduled_at: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    createContact: {
      input: {
        audience_id: string;
        email: string;
        first_name?: string;
        last_name?: string;
        unsubscribed?: boolean;
      };
      output: unknown;
    };
    updateContact: {
      input: {
        audience_id: string;
        contact_id: string;
        first_name?: string;
        last_name?: string;
        unsubscribed?: boolean;
      };
      output: unknown;
    };
    deleteContact: {
      input: {
        audience_id: string;
        contact_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    listContacts: {
      input: {
        audience_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    listDomains: {
      input: {};
      output: unknown;
    };
    createDomain: {
      input: {
        name: string;
        region?: 'us-east-1' | 'eu-west-1' | 'ap-northeast-1' | 'sa-east-1';
      };
      output: unknown;
    };
    deleteDomain: {
      input: {
        domain_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    verifyDomain: {
      input: {
        domain_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    listAudiences: {
      input: {};
      output: unknown;
    };
    createAudience: {
      input: {
        name: string;
      };
      output: unknown;
    };
    deleteAudience: {
      input: {
        audience_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    listBroadcasts: {
      input: {};
      output: unknown;
    };
    createBroadcast: {
      input: {
        audience_id: string;
        from: string;
        subject: string;
        name?: string;
        reply_to?: string;
        preview_text?: string;
        content_type: 'html' | 'text';
        content: string;
      };
      output: unknown;
    };
    sendBroadcast: {
      input: {
        broadcast_id: string;
        scheduled_at?: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    deleteBroadcast: {
      input: {
        broadcast_id: string;
        [k: string]: unknown;
      };
      output: unknown;
    };
    customApiCall: {
      input: {
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
        /**
         * API path relative to the piece base URL.
         */
        path: string;
        /**
         * Query parameters. Array values are sent as repeated keys.
         */
        query?: {
          [k: string]: (string | number | boolean) | (string | number | boolean)[];
        };
        headers?: {
          [k: string]: string;
        };
        bodyType: 'json' | 'form' | 'raw' | 'formData';
        body?: unknown;
        responseType: 'json' | 'text' | 'binary';
        /**
         * Name of the saved file for binary responses.
         */
        fileName?: string;
        /**
         * Return the response instead of throwing on a non-2xx status.
         */
        failsafe: boolean;
        timeoutSeconds: number;
      };
      output: {
        status: number;
        headers: {
          [k: string]: string;
        };
        body: unknown;
      };
    };
  };
  triggers: {};
}
