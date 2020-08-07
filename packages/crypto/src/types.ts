import * as networks from "./networks";

export type NetworkType =
    | typeof networks.mainnet.network
    | typeof networks.devnet.network
    | typeof networks.testnet.network
    | typeof networks.unitnet.network
    | typeof networks.realdevnet.network
    | typeof networks.staging.network
    | typeof networks.nospluginnet.network
    | typeof networks.realtestnet.network
    | typeof networks.realmainnet.network;

export type NetworkName = keyof typeof networks;
