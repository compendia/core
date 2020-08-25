import BetterSqlite3 from "better-sqlite3";
interface IStakeDbItem {
    key: string;
    address: string;
    powerup: number;
    redeemable: number;
    status: 0; // 0: Either grace or powering, 1: powered up
}

const database: BetterSqlite3.Database = new BetterSqlite3(":memory:");

export { database, IStakeDbItem };
export * from "./plugin";
