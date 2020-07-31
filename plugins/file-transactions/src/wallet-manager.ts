import { State } from "@arkecosystem/core-interfaces";
import { SetFileHelper } from "./helpers";

export enum FileIndex {
    Schemas = "schemas",
}

export const schemaIndexer = (index: State.IWalletIndex, wallet: State.IWallet): void => {
    if (wallet.hasAttribute("files")) {
        for (const fileKey of Object.keys(wallet.getAttribute("files", {}))) {
            if (fileKey.startsWith("schema.")) {
                index.set(SetFileHelper.getKey(fileKey), wallet.getAttribute("files")[fileKey]);
            }
        }
    }
};
