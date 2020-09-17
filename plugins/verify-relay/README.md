# Relay Verifier for ARK Core

THIS SOFTWARE IS PROVIDED “AS IS”. THE DEVELOPER DISCLAIMS ANY AND ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION THE IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. THE DEVELOPER SPECIFICALLY DOES NOT WARRANT THAT THE SOFTWARE WILL BE ERROR-FREE, ACCURATE, RELIABLE, COMPLETE OR UNINTERRUPTED.

## Introduction

This plugin can be used on ARK Core powered nodes to prove ownership of a relay. It adds a `/api/verify` endpoint to the Public API which includes a timestamped signed message.

## Usage

When installed, a relay owner can send a `PUT` request to the new `/api/verify` endpoint with their passphrase as the payload. This request **MUST** originate from 127.0.0.1. If the passphrase matches a registered delegate, the response will return the name of the delegate and a secret key. Otherwise, an error will occur.

After providing a valid passphrase, you can publicly confirm ownership of the relay by visiting `/api/verify?key={key}` (where `{key}` is the secret key from the `PUT` response) which will return a signed message in a JSON payload:

```
{"publicKey":"0215789ac26155b7a338708f595b97c453e08918d0630c896cbd31d83fe2ad1c33","signature":"30450221009023531f43f9565337e40d8ad4a5bdf4708fd7c2d23430ce39a2ab1f1d3da31c02206ed4c3caabb2885aac4590b8317bf61b2c4addb6f1c3f2743aeb526b105fa281","message":"110153280"}
```

This allows a centralised third party tool to verify that the IP address belongs to the delegate indicated by the public key, since the message is signed by their passphrase. The message itself is a timestamp based on the network epoch, which can be used to ensure the result is live and not static. The third party provider can record the verification and display the total number of verified relays each delegate is running without exposing their IP addresses. Once confirmed by the third party tool, the endpoint can be deactivated by sending a `DELETE` request to `/api/verify`. Again, this **MUST** originate from 127.0.0.1.

## Examples

To prove ownership of a relay:

```
curl -X PUT -d "word stick ramp glide april salad twelve engine own cattle fringe future" http://127.0.0.1:4003/api/verify
```

After entering the above, it is **strongly recommended** to erase the passphrase from your history file afterwards with `history -d $((HISTCMD-2)); history -d $((HISTCMD-1))` so it cannot be retrieved.

To deactivate the endpoint after successfully proving ownership:

```
curl -X DELETE http://127.0.0.1:4003/api/verify
```

## Installation

Clone this repository into the `plugins` folder of your ARK Core installation and then add the following code block to your Core configuration file (usually `plugins.js`) **after all other sections**:

```
"@alessiodf/verify-relay": {}
```

Additionally, ensure the API is enabled and is publicly accessible, since the plugin works by adding an additional endpoint to it.

Recompile ARK Core with `yarn build` and restart the relay.

## Support

If you need support, reach out on Discord by messaging `🅶🆈🅼#0666` or you might find me lurking in Slack as `king turt`.

## License

[GPLv3](LICENSE) © [alessiodf](https://github.com/alessiodf/)
