const {
    Blocks
} = require('@nosplatform/crypto')

exports.deserialize = data => {
    return Blocks.Block.deserialize(data)
}
