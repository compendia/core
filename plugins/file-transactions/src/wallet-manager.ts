import { State } from "@arkecosystem/core-interfaces";

export enum FileIndex {
    Schemas = "schemas",
}

export const schemaIndexer = (index: State.IWalletIndex, wallet: State.IWallet): void => {
    if (wallet.hasAttribute("files")) {
        const files = wallet.getAttribute("files", {});
        for (const fileKey of Object.keys(files)) {
            if (fileKey === "schema") {
                const schemas = Object.keys((files as any).schema);
                for (const schema of schemas) {
                    index.set(schema, wallet);
                }
            }
        }
    }
};
