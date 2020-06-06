![Core Chameleon](https://raw.githubusercontent.com/alessiodf/core-chameleon/master/banner.png)

# Core Chameleon: A Plugin for ARK Core

THIS SOFTWARE IS PROVIDED “AS IS”. THE DEVELOPER DISCLAIMS ANY AND ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION THE IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. THE DEVELOPER SPECIFICALLY DOES NOT WARRANT THAT THE SOFTWARE WILL BE ERROR-FREE, ACCURATE, RELIABLE, COMPLETE OR UNINTERRUPTED.

# Introduction

Core Chameleon is a plugin for ARK Core 2.6 which is specifically designed for forging delegate node operators to externally close their peer-to-peer port, which is vulnerable to denial-of-service and other attacks. It also hides the IP address of the node by routing all traffic via Tor, ensuring total anonymity which prevents the identification of the node or its hosting provider. The plugin also enables the full and complete operation of a relay or forging node when running behind a firewall, which may be useful for some corporate users that cannot open an external port but still want to receive live blocks and transactions on the network. It also has other benefits which transcend beyond security, such as being able to run multiple conflicting networks on the same server.

**If you are installing this plugin on a forging node, please also consider running an additional non-forging open relay (without this plugin) on a separate server, and do this for every forging node that you install this plugin on. Remember, every node running this plugin becomes invisible - which is a good thing for the security of forging nodes! - but the network needs publicly available open relays as they are essential for the network to function correctly.**

### Hide your IP address

The plugin uses Tor so the originating IP address cannot be identified since it is never revealed to any other ARK Core node, nor does it appear in peer lists. Multiple Tor circuits are used to transmit data between other nodes to minimise latency and maintain connectivity even if one or more Tor nodes go offline.

This means nodes cannot be identified to be targeted in a cyber-attack against the network by examining log files or peer lists.

### Close the P2P port

The peer-to-peer port of the node is completely closed and inter-process communication between relay and forger is carried out using a local UNIX socket instead of an externally available websocket port. Blocks and transactions are pulled from other nodes in real time, again all via Tor, for privacy and anonymity.

Assuming a forging node operator also closes their public API and other unnecessary ports such as the webhook and RPC servers, port scanning will not be able to identify the presence of a node running ARK Core, which can give operators some peace of mind as they will not be targets of socio-abuse or technical attacks.

### Compatibility with firewalls

Some relay operators may find themselves stuck behind a restrictive corporate firewall beyond their control, but still may need to run a full node properly which is currently impossible with stock Core 2.6. Ordinarily, any node behind a corporate firewall or NAT cannot sync with the network in real time, nor can they receive transactions sent into the network from other nodes; instead they only download new blocks every minute which means they continually fall out of sync and cannot be used for any time-critical purposes.

By installing this plugin on those nodes, they will instead look and feel like normal nodes, since they will immediately receive blocks as and when they are produced by delegates and will also process incoming transactions as they propagate across the network.

### Run multiple conflicting networks

Each network powered by Core 2.6 uses a hardcoded port for P2P traffic which cannot be changed. For example, the ARK Public Network uses port 4001, the ARK Development Network uses port 4002 and Qredit uses port 4101. This is fine, because each port is different so a single node can run all three networks without issue. But, for example, the nOS Development Network also uses port 4002, which clashes with the ARK Development Network. Similarly, the Unikname Livenet uses port 4001, which clashes with the ARK Public Network. This means that it is impossible for the same IP address to reliably run a relay or forger for both ARK and nOS Development Networks concurrently, or the ARK Public Network and the Unikname Livenet at the same time. An operator wanting to reliably run nodes on conflicting networks with full functionality would need to use a separate IP address, which normally means paying for a second separate server.

This plugin eliminates that barrier, allowing the same server with the same IP address to run multiple networks that would otherwise clash, all at the same time. This is acheived with no loss of functionality and is made possible since we no longer use an external P2P port so there are no port conflicts. This has a potential cost saving for operators as they could run many networks on the same server.

Please note that operators may also need to adjust their configuration files to close or change the port of any other overlapping services such as the public API used by any conflicting networks as this plugin only handles the P2P port. This is straightforward as these other ports are not hardcoded and may be changed without causing issues, unlike the P2P port in Core 2.6.

## Installation

Core Chameleon includes a script that will automatically download the plugin, install Tor and configure your node. Download it as follows:

```
curl -o chameleon.sh https://raw.githubusercontent.com/alessiodf/core-chameleon/master/chameleon.sh
```

If you have installed ARK Core using the default installation script provided by ARK Ecosystem, execute the script with `bash chameleon.sh --install`. If you have installed from Git (for example, via the ARK Deployer or Core Control program), execute the script by including the path to your Core installation. For example, in the case of nOS, run `bash chameleon.sh --install /home/nos/nos-core`.

This will install Tor and other dependencies (if they are not already installed), then download and install the latest version of the Core Chameleon plugin. If you are already using the Block Propagator plugin, the installation script will ask if you want to disable it. Core Chameleon supersedes Block Propagator, and the two plugins may clash if used together, so it is strongly recommended that you disable Block Propagator if it is present.

Once the installation is complete, you should delete this file.

## Updates, Configuration and Removal

Once installed, you can check for any updates and enable or disable the plugin on demand by running `chameleon` and specifying the action you want, for example `chameleon --update`. Valid actions are listed below:

`--enable`: Enables Core Chameleon in your Core configuration.

`--disable`: Disables Core Chameleon in your Core configuration.

`--install`: Installs Core Chameleon (for example, if you have multiple installations of Core and wish to install another copy of Core Chameleon in another path).

`--remove`: Removes Core Chameleon.

`--update`: Updates Core Chameleon to the latest version.

`--version`: Prints the currently installed version of Core Chameleon.

In the case of a Git-based installation, you must also add the path to Core after the action, such as `chameleon --update /home/nos/nos-core`.

## Manual Configuration

The automated tool will attempt to enable Core Chameleon with sane defaults that should be sufficient for most users to provide all the necessary protection and functionality including Tor anonymity. However, some bridgechains may use a custom Core configuration file format which Core Chameleon's installation tool cannot understand, so in those cases you must manually configure it.

In its most basic form, you should add the following code block to your Core configuration file (usually `plugins.js` but may vary depending on bridgechain) **immediately after the `@arkecosystem/core-p2p` block** to enable Core Chameleon using the default settings:

```
"@alessiodf/core-chameleon": {
    enabled: true,
},

```

You can also set `{ enabled: "ifDelegate" }` to only enable the plugin if your node has at least one passphrase configured in its `delegates.json` file.

For example, your `plugins.js` file should look similar to this:

```
...
"@arkecosystem/core-p2p": {
    server: {
        port: process.env.CORE_P2P_PORT || 4001,
    },
},
"@alessiodf/core-chameleon": {
    enabled: true,
},
"@arkecosystem/core-state": {},
...

```

If you would like to deviate from the default behaviour of Core Chameleon, please see below for a list of all of the options and their default values.

```
"@alessiodf/core-chameleon": {
    apiSync: false,
    enabled: false,
    fetchTransactions: true,
    tor: {
        enabled: true,
        instances: {
           max: 10,
           min: 3,
        },
        path: undefined,
    },
},
```

`apiSync`: This will determine whether Core should initially sync with the network using the P2P layer or the Public API. Using the P2P layer is much faster, so is the default, but can sometimes be unreliable over Tor due to the high volume of data that may be transferred via a single websocket. If you experience problems syncing via the P2P layer, you can set this to `true` to use the Public API instead which will split the load more evenly across multiple Tor nodes. Be aware that this will be significantly slower but more stable. Default: `false`.

`enabled`: This must be `true` for Core Chameleon to start. Setting it to `false` will disable all functionality and revert Core to standard behaviour. Default: `false`.

`fetchTransactions`: This option sets whether the plugin should poll the network for unconfirmed transactions to add to our transaction pool. It adds more network overhead so you can set this to `false` if you are only running a relay and you do not care about receiving unconfirmed transactions. If you are a forging delegate, this should always be `true`. Default: `true`.

`tor.enabled`: This is used to enable or disable the use of Tor in the plugin. By setting this to `false`, your IP address can still be identified via other ARK Core nodes, although it will not appear in peer lists. However, even with Tor disabled, you will still benefit from the other features of Core Chameleon, such as the closure of the P2P port, compatibility with firewalls and the ability to run multiple conflicting networks. Default: `true`.

`tor.instances.max`: This number determines how many Tor circuits will be opened in total. The minimum is 1 and the maximum is 10. More circuits use more system resources but improve peering, redundancy and latency by opening multiple connections to different Tor nodes to distribute the traffic. Default: `10`.

`tor.instances.min`: This number determines the minimum amount of Tor circuits that must be opened before Core will start. The minimum is 1 and the maximum is 10. Fewer circuits allow Core to start sooner, but potentially at the expense of redundancy, latency and peering while Core initialises. Default: `3`.

`tor.path`: This should point to the binary executable path for Tor, in case you have installed it manually in a non-standard location. Otherwise, the plugin will attempt to automatically detect the location based on common system paths. Default: `undefined`.

### Support

If you need support, reach out on Discord by messaging `🅶🆈🅼#0666` or you might find me lurking in Slack as `king turt`.

## License

[GPLv3](LICENSE) © [alessiodf](https://github.com/alessiodf/)
