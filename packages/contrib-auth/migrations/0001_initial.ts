import type { Migration, SchemaSnapshot } from '@tango-ts/migrations'

export const migration: Migration = {
  "name": "0001_initial",
  "operations": [
    {
      "kind": "createTable",
      "table": {
        "name": "auth_tokens",
        "columns": {
          "id": {
            "name": "id",
            "type": "int",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": true,
            "primaryKey": true,
            "unique": false
          },
          "tokenHash": {
            "name": "tokenHash",
            "type": "varchar",
            "nullable": false,
            "hasDefault": false,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": true,
            "maxLength": 64
          },
          "userId": {
            "name": "userId",
            "type": "int",
            "nullable": false,
            "hasDefault": false,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false
          },
          "name": {
            "name": "name",
            "type": "varchar",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "maxLength": 255,
            "default": ""
          },
          "createdAt": {
            "name": "createdAt",
            "type": "datetime",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "autoNowAdd": true
          },
          "expiresAt": {
            "name": "expiresAt",
            "type": "datetime",
            "nullable": true,
            "hasDefault": false,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false
          },
          "lastUsedAt": {
            "name": "lastUsedAt",
            "type": "datetime",
            "nullable": true,
            "hasDefault": false,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false
          }
        },
        "primaryKey": [
          "id"
        ],
        "uniques": [
          [
            "tokenHash"
          ]
        ],
        "foreignKeys": []
      }
    },
    {
      "kind": "createTable",
      "table": {
        "name": "auth_users",
        "columns": {
          "id": {
            "name": "id",
            "type": "int",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": true,
            "primaryKey": true,
            "unique": false
          },
          "email": {
            "name": "email",
            "type": "varchar",
            "nullable": false,
            "hasDefault": false,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": true,
            "maxLength": 254
          },
          "password": {
            "name": "password",
            "type": "varchar",
            "nullable": false,
            "hasDefault": false,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "maxLength": 128
          },
          "firstName": {
            "name": "firstName",
            "type": "varchar",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "maxLength": 150,
            "default": ""
          },
          "lastName": {
            "name": "lastName",
            "type": "varchar",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "maxLength": 150,
            "default": ""
          },
          "isActive": {
            "name": "isActive",
            "type": "boolean",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "default": true
          },
          "isStaff": {
            "name": "isStaff",
            "type": "boolean",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "default": false
          },
          "isSuperuser": {
            "name": "isSuperuser",
            "type": "boolean",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "default": false
          },
          "dateJoined": {
            "name": "dateJoined",
            "type": "datetime",
            "nullable": false,
            "hasDefault": true,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false,
            "autoNowAdd": true
          },
          "lastLogin": {
            "name": "lastLogin",
            "type": "datetime",
            "nullable": true,
            "hasDefault": false,
            "autoIncrement": false,
            "primaryKey": false,
            "unique": false
          }
        },
        "primaryKey": [
          "id"
        ],
        "uniques": [
          [
            "email"
          ]
        ],
        "foreignKeys": []
      }
    }
  ]
}

export const snapshotAfter: SchemaSnapshot = {
  "version": 1,
  "tables": {
    "auth_users": {
      "name": "auth_users",
      "columns": {
        "id": {
          "name": "id",
          "type": "int",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": true,
          "primaryKey": true,
          "unique": false
        },
        "email": {
          "name": "email",
          "type": "varchar",
          "nullable": false,
          "hasDefault": false,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": true,
          "maxLength": 254
        },
        "password": {
          "name": "password",
          "type": "varchar",
          "nullable": false,
          "hasDefault": false,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "maxLength": 128
        },
        "firstName": {
          "name": "firstName",
          "type": "varchar",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "maxLength": 150,
          "default": ""
        },
        "lastName": {
          "name": "lastName",
          "type": "varchar",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "maxLength": 150,
          "default": ""
        },
        "isActive": {
          "name": "isActive",
          "type": "boolean",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "default": true
        },
        "isStaff": {
          "name": "isStaff",
          "type": "boolean",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "default": false
        },
        "isSuperuser": {
          "name": "isSuperuser",
          "type": "boolean",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "default": false
        },
        "dateJoined": {
          "name": "dateJoined",
          "type": "datetime",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "autoNowAdd": true
        },
        "lastLogin": {
          "name": "lastLogin",
          "type": "datetime",
          "nullable": true,
          "hasDefault": false,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false
        }
      },
      "primaryKey": [
        "id"
      ],
      "uniques": [
        [
          "email"
        ]
      ],
      "foreignKeys": []
    },
    "auth_tokens": {
      "name": "auth_tokens",
      "columns": {
        "id": {
          "name": "id",
          "type": "int",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": true,
          "primaryKey": true,
          "unique": false
        },
        "tokenHash": {
          "name": "tokenHash",
          "type": "varchar",
          "nullable": false,
          "hasDefault": false,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": true,
          "maxLength": 64
        },
        "userId": {
          "name": "userId",
          "type": "int",
          "nullable": false,
          "hasDefault": false,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false
        },
        "name": {
          "name": "name",
          "type": "varchar",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "maxLength": 255,
          "default": ""
        },
        "createdAt": {
          "name": "createdAt",
          "type": "datetime",
          "nullable": false,
          "hasDefault": true,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false,
          "autoNowAdd": true
        },
        "expiresAt": {
          "name": "expiresAt",
          "type": "datetime",
          "nullable": true,
          "hasDefault": false,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false
        },
        "lastUsedAt": {
          "name": "lastUsedAt",
          "type": "datetime",
          "nullable": true,
          "hasDefault": false,
          "autoIncrement": false,
          "primaryKey": false,
          "unique": false
        }
      },
      "primaryKey": [
        "id"
      ],
      "uniques": [
        [
          "tokenHash"
        ]
      ],
      "foreignKeys": []
    }
  }
}

export default migration
