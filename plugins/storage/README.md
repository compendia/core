# nOS Custom Storage Plugin for ARK Core

> TypeORM + SQLite based storage plug-in

<!-- [![Build Status](https://img.shields.io/travis/ArkEcosystem/core-plugin-skeleton/master.svg?style=flat-square)](https://travis-ci.org/nos/core-plugin-storage) -->
<!-- [![Latest Version](https://img.shields.io/github/release/ArkEcosystem/core-plugin-skeleton.svg?style=flat-square)](https://github.com/nos/core-plugin-storage/releases) -->

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

In your ARK Core directory:

```
cd plugins
git clone https://github.com/nos/core-plugin-storage.git
```

Add the plug-in to your network's `plugins.js` after the postgres module:

```
...
"@arkecosystem/core-database-postgres": {
    ...
},
"@nosplatform/storage": {},
...
```

Delete the entities (not `index.ts` and `tsconfig.json`) from the `entities` dir as these are native to the nOS blockchain.

## Usage

Create [TypeORM entities](https://typeorm.io/#/entities/column-types-for-sqlite--cordova--react-native--expo) into the plugin's `entities` directory.

Example `User.ts` entity:

```ts
import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm";

@Entity()
export class User extends BaseEntity {
    @PrimaryGeneratedColumn("int")
    id: number;

    @Column("varchar")
    firstName: string;

    @Column("varchar")
    lastName: string;

    @Column("int")
    age: number;
}
```

Include the `User` entity in the plugin's `src/storage.ts` in `createConnection({...})`:

```ts
await createConnection({
    type: "sqlite",
    database: dbPath,
    // Import entities to connection
    entities: [User],
    synchronize: true,
});
```

`yarn build` in the plug-in dir.

Import `q` and your entity into any other ARK Core module or plug-in and use it.

Example:

```ts
import { q, User } from "@nosplatform/storage";

q(async () => {
    const user = new User();
    user.firstName = "Timber";
    user.lastName = "Saw";
    user.age = 25;
    await user.save();

    const allUsers = await User.find();
    const firstUser = await User.findOne(1);
    const timber = await User.findOne({ firstName: "Timber", lastName: "Saw" });

    await timber.remove();
});
```

Wrapping your TypeORM database tasks in the `q` module executes the task in a queue. This way, database write tasks can be executed virtually simultaneously without blocking the blockchain's consensus and synchronization processes.

If you don't wrap your database tasks in `q()`, you might run into issues with concurrent sqlite database writes.

## Security

If you discover a security vulnerability within this package, please send an e-mail to contact@nos.io. All security vulnerabilities will be promptly addressed.

## Credits

-   [Dean van Dugteren](https://github.com/Deanpress)
-   [All Contributors](../../../../contributors)

## License

[MIT](LICENSE) © [nOS](https://nos.io)
