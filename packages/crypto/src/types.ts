import * as networks from "./networks";

export type NetworkType =
    | typeof networks.mainnet.network
    | typeof networks.devnet.network
    | typeof networks.testnet.network
    | typeof networks.unitnet.network
    | typeof networks.nosdevnet.network
    | typeof networks.nospluginnet.network;

export type NetworkName = keyof typeof networks;
