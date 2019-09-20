const {
    Transactions
} = require('@nosplatform/crypto')

exports.deserialize = data => {
    return Transactions.deserializer.deserialize(data)
}
