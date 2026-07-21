# Teen Patti - Poker Game


Nepali Teen Patti - but the betting is done in ETH, in
a smart contract with the sepolia testnet.

## Why we built this

I wanted to learn about the block chain and implement it on my own we built this project as team of,<br>
* Nirnaya Singh Basnet
* Me - Brishkamal Karki

Unfortunately, the frontend and the backend part is vibecoded due to lack of time except the smart contract.<br>
Someone creates a room, up to four people pay in to join with there metamask wallet connected, one hand of cards gets played, the winner takes the whole pot, and the room is done. <br>
Want to play? <br>
[teenpatti-poker.brishkamalkarki.com.np](https://teenpatti-poker.brishkamalkarki.com.np)


## Simple workflow of the project

- **Create a game** or **join a game** - both send your entry fee (ETH) into the contract's pot
- **Betting** (chaal, raise, show) - each action adds more ETH straight into that same pot
- **Finish game** - the entire pot is sent out in one transaction, straight to the winner's wallet

There are three main parts of the project:

- **The contract** (`src/TeenPattiGame.sol`) - the bank. Holds every entry fee
  and bet, pays out the winner. Doesn't know or care what cards anyone has.
- **The backend** (`teenpatti-backend/`) - the referee. Shuffles, deals,
  keeps track of whose turn it is, and decides who won. Doesn't know or care
  about wallets. (See its own README for how it's put together.)
- **The frontend** (`teenpatti-frontend/`) - the table itself. Talks to both
  of the above. (Same - its own README covers the file layout.)

### In what actions does the transaction happens

- **Creating or joining a room** - yes, that's your entry fee
- **Dealing the cards** - yes, locks in who's playing
- **Chaal, Raise, Show** - yes, real ETH goes into the pot
- **Looking at your cards, Packing** - no, free and instant
- **Paying out the winner** - yes, the whole pot moves in one transaction

## Game rules

- **Entry fee** - everyone pays the same amount to sit down. That's the whole
  starting pot, nothing extra.
- **Blind vs. Seen** - you start "blind" (haven't looked at your cards yet)
  and owe the table stake to keep betting. Once you peek, you're "seen" and
  now owe **double** for the rest of the hand. Looking is free though - it
  doesn't cost you your turn.
- **Chaal** - just bet what you already owe. Turn passes left.
- **Raise** - bet more than you owe, which pushes the stake up for everyone.
- **Pack** - fold. Your money stays in the pot either way. Last person left
  standing takes it all.
- **Show** - only happens with exactly 2 players left. Pay what you owe, both
  hands flip over, best hand wins the pot. Exact ties split it.
- **Hand ranking**, best to worst: Trail (three of a kind) - Pure Sequence -
  Sequence - Colour - Pair - High Card. A-2-3 counts as the lowest sequence.


## Running it on your own machine

U need to have the Foundry.

```bash
./run-local.sh # from the base folder
```

That one command deploys the contract to it,
drops the address into the frontend's `.env`, and starts both the server and
the UI. Then just open <http://localhost:5173>.

In MetaMask, one time only:

1. Add a network - RPC `http://127.0.0.1:8545`, chain id **31337**.
2. Import one of the test accounts Anvil prints when it starts (each one
   comes loaded with 10,000 fake ETH).
3. Come from 4 different accounts or the browser to play in the room.

U can also play it live: <br>
[teenpatti-poker.brishkamalkarki.com.np](https://teenpatti-poker.brishkamalkarki.com.np)
