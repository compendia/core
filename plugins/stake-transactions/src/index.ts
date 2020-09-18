import BetterSqlite3 from "better-sqlite3";
interface IStakeDbItem {
    key: string;
    address: string;
    powerup: number;
    redeemable: number;
    status: 0; // 0: Either grace or powering, 1: powered up
}

const database: BetterSqlite3.Database = new BetterSqlite3(":memory:");

const initDb = () => {
    database.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS stakes (
        "key" VARCHAR(64) PRIMARY KEY,
        "address" VARCHAR(34) NOT NULL,
        "powerup" INT NOT NULL,
        "redeemable" INT NOT NULL,
        "STATUS" INT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stake_queue (
        "key" VARCHAR(64) PRIMARY KEY,
        "address" VARCHAR(34) NOT NULL,
        "powerup" INT NOT NULL,
        "redeemable" INT NOT NULL
    );
    `);
};

export { database, initDb, IStakeDbItem };
export * from "./plugin";
