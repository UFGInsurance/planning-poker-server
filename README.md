# Planning Poker Websocket Design

### Production server is running at ws://ufg-planning-poker.herokuapp.com/planning-poker


### to connect to the server:
using the socket.io-client library connect to `ws://{host}/planning-poker`

## Public actions
- join a room by emitting a `"join"` event with payload
    ```
    {
        id: "optional room id",
        username: "my screen name"
    }
    ```
    - If no id is sent a new room will be created with a randomly generated unique id

    - creating a room automatically sets the creator as the room owner. Room owners cannot be changed. To 'change' an owner just create a new room

- To send your estimate to the server emit a `"set_estimate"` event with payload
    ```
    "estimate as string"
    ```
Valid estimates include, although not limited to, `1, 2, 3, 5, 8, 13, 21, "", ?, pass, ∞, ¯\_(ツ)_/¯`

    IMPORTANT NOTE:
    Estimate values will be masked with "X" until the cards are flipped

## Owner only actions
- as the owner you may flip the cards by emitting `"flip_cards"`
    - this will return the state the current state of the room and expose the values selected by participants.
    - once cards are flipped participants will no longer be able to change estimates

- as the owner you may reset the game room by emitting `"reset_cards"`
    - all estimates will be reset and flipped status will revert to `false`
