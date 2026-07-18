"""Two-client smoke test that plays a full round through the real socket.io
wire protocol. Run this with the server already running locally:

    uvicorn app.server:app --port 4000   # in one terminal
    python3 smoke_test.py                # in another

Useful as a quick sanity check after touching engine.py / server.py.
Requires: pip install "python-socketio[client]" aiohttp
"""
import asyncio
import socketio

URL = "http://127.0.0.1:4000"


async def emit_ack(sio, event, payload):
    fut = asyncio.get_event_loop().create_future()

    def cb(ack):
        if not fut.done():
            fut.set_result(ack)

    await sio.emit(event, payload, callback=cb)
    return await asyncio.wait_for(fut, timeout=5)


async def main():
    host = socketio.AsyncClient()
    guest = socketio.AsyncClient()

    host_states = []
    guest_states = []
    host.on("room:state", lambda s: host_states.append(s))
    guest.on("room:state", lambda s: guest_states.append(s))

    await host.connect(URL)
    await guest.connect(URL)

    ack = await emit_ack(host, "room:create", {"hostName": "Karan", "maxSeats": 4, "buyIn": 100})
    assert "error" not in ack, ack
    room_code, host_id = ack["roomCode"], ack["playerId"]
    print("created room", room_code, "host", host_id)

    await host.emit("room:subscribe", {"roomCode": room_code})

    ack = await emit_ack(guest, "room:join", {"roomCode": room_code, "playerName": "Sita", "buyIn": 100})
    assert "error" not in ack, ack
    guest_id = ack["playerId"]
    print("guest joined as", guest_id)

    await guest.emit("room:subscribe", {"roomCode": room_code})
    await asyncio.sleep(0.3)

    ack = await emit_ack(host, "room:startHand", {"roomCode": room_code})
    assert "error" not in ack, ack
    state = ack["state"]
    print("round started, phase =", state["phase"], "turn index =", state["currentTurnIndex"])

    # Confirm card-masking: host's own cards visible, guest's cards hidden from host.
    host_seat = next(s for s in state["seats"] if s and s["playerId"] == host_id)
    guest_seat_from_host_pov = next(s for s in state["seats"] if s and s["playerId"] == guest_id)
    assert host_seat["cards"][0] is not None, "host should see own cards"
    assert guest_seat_from_host_pov["cards"][0] is None, "host should NOT see guest's cards"
    print("card masking OK")

    turn_order = [host_id, guest_id] if state["currentTurnIndex"] == 0 else [guest_id, host_id]
    clients = {host_id: host, guest_id: guest}

    # Everyone packs except the second actor -> last-standing win.
    first, second = turn_order
    ack = await emit_ack(clients[first], "room:action", {"roomCode": room_code, "playerId": first, "type": "pack"})
    assert "error" not in ack, ack
    state = ack["state"]
    print("after pack, phase =", state["phase"], "winners =", state["winners"])
    assert state["phase"] == "roundComplete"
    assert state["winners"][0]["playerId"] == second

    await asyncio.sleep(0.3)
    print("host_states received:", len(host_states), " guest_states received:", len(guest_states))
    assert len(host_states) >= 2 and len(guest_states) >= 2

    await host.disconnect()
    await guest.disconnect()
    print("SMOKE TEST PASSED")


asyncio.run(main())
