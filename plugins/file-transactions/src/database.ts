import BetterSqlite3 from "better-sqlite3";
import { IDatabaseItem } from "./interfaces";

const database: BetterSqlite3.Database = new BetterSqlite3(":memory:");

const initDb = () => {
    database.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS databases (
        "id" VARCHAR(64) PRIMARY KEY,
        "schema" VARCHAR(64) NOT NULL,
        "hash" VARCHAR(64) NOT NULL,
        "owner_address" VARCHAR(34) NOT NULL,
        "owner_username" VARCHAR(64)
    );
    `);
};

export { database, initDb, IDatabaseItem };
