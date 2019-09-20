import { Utils } from "@nosplatform/crypto/src";

/* tslint:disable:max-line-length */
export const blocks = [
    {
        id: "13114381566690093367",
        version: 0,
        timestamp: 0,
        previous_block: undefined,
        top_reward: Utils.BigNumber.make("0"),
        removed_fee: Utils.BigNumber.make("0"),
        height: 1,
        number_of_transactions: 52,
        total_amount: Utils.BigNumber.make("12500000000000000"),
        total_fee: Utils.BigNumber.make("0"),
        reward: Utils.BigNumber.make("0"),
        payload_length: 11395,
        payload_hash: "2a44f340d76ffc3df204c5f38cd355b7496c9065a1ade2ef92071436bd72e867",
        generator_public_key: "03d3fdad9c5b25bf8880e6b519eb3611a5c0b31adebc8455f0e096175b28321aff",
        block_signature:
            "3044022035694a9b99a9236655c658eb07fc3b02ce5edcc24b76424a7287c54ed3822b0602203621e92defb360490610f763d85e94c2db2807a4bd7756cc8a6a585463ef7bae",
    },
    {
        id: "11721400091644233767",
        version: 0,
        timestamp: 45020906,
        previous_block: "13114381566690093367",
        height: 2,
        number_of_transactions: 0,
        total_amount: Utils.BigNumber.make("0"),
        total_fee: Utils.BigNumber.make("0"),
        reward: Utils.BigNumber.make("0"),
        top_reward: Utils.BigNumber.make("0"),
        removed_fee: Utils.BigNumber.make("0"),
        payload_length: 0,
        payload_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        generator_public_key: "02637b15aa50fa95018609a6d7b52b025de807a41b79b164626cee87dd6f61a662",
        block_signature:
            "304402204020c837df631582fa32c5b160761dd38afc0c65149782773d1277d696dd4596022029d7de41039b7a55ceec37bfd27dec92c1cf4c93e6fc737e74b76fb9f1fb320a",
    },
    {
        id: "9419329516955558048",
        version: 0,
        timestamp: 45020914,
        previous_block: "11721400091644233767",
        height: 3,
        number_of_transactions: 0,
        total_amount: Utils.BigNumber.make("0"),
        total_fee: Utils.BigNumber.make("0"),
        top_reward: Utils.BigNumber.make("0"),
        removed_fee: Utils.BigNumber.make("0"),
        reward: Utils.BigNumber.make("0"),
        payload_length: 0,
        payload_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        generator_public_key: "02e9ef70986ab6de9dbd5e1f430018bb8dea671d30c1e34af5146a48f2b73d551d",
        block_signature:
            "30440220153d88f4017960e6cd920a72c516c68c484d31324bd0e89101218a9da621eed3022055cdd5907d2b9fafd761e0c652c4c63cb8bc2ae5c424189066d44f6068957c13",
    },
];
