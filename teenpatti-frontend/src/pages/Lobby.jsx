// initial page of the website

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toasts.jsx';
import { useWallet, WalletButton } from '../components/Wallet.jsx';
import { Badge, Button, Panel } from '../components/ui.jsx';
import { createGame, joinGame, readableError } from '../lib/contract.js';
import { ethLabel, isValidRoomCode, randomRoomCode, toEth, toWei } from '../lib/format.js';
import { rememberName, recallName, saveSession } from '../lib/session.js';
import { server } from '../lib/socket.js';
import '../styles/lobby.css';

const MIN_FEE = '0.0001';
const MAX_FEE = '1';

export default function Lobby() {
  const [tab, setTab] = useState('create');

  return (
    <div className="lobby">
      <header className="lobby__top">
        <WalletButton />
      </header>

      <main className="lobby__main">
        <div className="lobby__brand">
          <h1 className="lobby__title">तीन पत्ती</h1>
          <p className="lobby__subtitle">Teen Patti — played for real ETH, settled by a smart contract</p>
        </div>

        <div className="lobby__card">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'create'}
              className={`tabs__btn ${tab === 'create' ? 'is-active' : ''}`}
              onClick={() => setTab('create')}
            >
              Create a room
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'join'}
              className={`tabs__btn ${tab === 'join' ? 'is-active' : ''}`}
              onClick={() => setTab('join')}
            >
              Join with a code
            </button>
          </div>

          {tab === 'create' ? <CreateRoom /> : <JoinRoom />}
        </div>

        <HowItWorks />
      </main>
    </div>
  );
}


function CreateRoom() {
  const navigate = useNavigate();
  const toast = useToast();
  const { ensureConnected, refreshBalance } = useWallet();

  const [name, setName] = useState(recallName());
  const [entryFee, setEntryFee] = useState('0.001');
  const [maxSeats, setMaxSeats] = useState(4);
  const [step, setStep] = useState(null); // what the player is waiting for

  async function handleCreate() {
    let entryFeeWei;
    try {
      entryFeeWei = toWei(entryFee);
    } catch (error) {
      return toast(error.message, 'error');
    }
    if (entryFeeWei < toWei(MIN_FEE) || entryFeeWei > toWei(MAX_FEE)) {
      return toast(`The entry fee must be between ${MIN_FEE} and ${MAX_FEE} ETH`, 'error');
    }

    try {
      await ensureConnected();

      // The room code lives on-chain, so it has to be unique there too. On the
      // tiny chance of a collision with an older game, pick another and retry.
      setStep(`Confirm the ${entryFee} ETH entry fee in your wallet…`);
      let created = null;
      let code = null;
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        code = randomRoomCode();
        try {
          created = await createGame({ code, entryFeeWei, maxPlayers: maxSeats });
        } catch (error) {
          if (error.revert?.name !== 'CodeAlreadyUsed' && error.errorName !== 'CodeAlreadyUsed') throw error;
        }
      }
      if (!created) throw new Error('Could not find a free room code — please try again');

      setStep('Opening the table…');
      const { playerId } = await server.createRoom({
        roomCode: code,
        gameId: created.gameId,
        entryFeeWei: entryFeeWei.toString(),
        maxSeats,
        hostName: name.trim() || 'Host',
        address: (await ensureConnected()).account,
        txHash: created.txHash,
      });

      rememberName(name.trim());
      saveSession({ roomCode: code, playerId, name: name.trim() });
      refreshBalance();
      navigate(`/room/${code}`);
    } catch (error) {
      toast(readableError(error), 'error');
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label className="field__label" htmlFor="host-name">
          Your name
        </label>
        <input
          id="host-name"
          className="input"
          value={name}
          maxLength={20}
          placeholder="e.g. Sita"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="lobby__pair">
        <div className="field">
          <label className="field__label" htmlFor="entry-fee">
            Entry fee (ETH)
          </label>
          <input
            id="entry-fee"
            className="input"
            type="number"
            inputMode="decimal"
            min={MIN_FEE}
            max={MAX_FEE}
            step="0.0001"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
          />
          <p className="field__hint">Everyone pays this to sit down. It is the starting pot.</p>
        </div>

        <div className="field">
          <span className="field__label">Players</span>
          <div className="seg">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={`seg__btn ${maxSeats === n ? 'is-active' : ''}`}
                onClick={() => setMaxSeats(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="field__hint">Four is the maximum at one table.</p>
        </div>
      </div>

      <Button size="lg" full onClick={handleCreate} busy={Boolean(step)}>
        {step || `Pay ${entryFee || '0'} ETH & open the table`}
      </Button>

      <p className="field__hint">
        This sends one transaction: <span className="mono">createGame()</span>. Your entry fee goes into the
        contract's pot and you get a 5-character room code to share.
      </p>
    </div>
  );
}


function JoinRoom() {
  const navigate = useNavigate();
  const toast = useToast();
  const { ensureConnected, refreshBalance } = useWallet();

  const [name, setName] = useState(recallName());
  const [code, setCode] = useState('');
  const [room, setRoom] = useState(null); // what the server says about this code
  const [looking, setLooking] = useState(false);
  const [step, setStep] = useState(null);
  const lookupToken = useRef(0);

  useEffect(() => {
    const clean = code.trim().toUpperCase();
    setRoom(null);
    if (!isValidRoomCode(clean)) return;

    const token = ++lookupToken.current;
    setLooking(true);
    const timer = setTimeout(async () => {
      try {
        const found = await server.lookupRoom(clean);
        if (token === lookupToken.current) setRoom(found);
      } catch {
        if (token === lookupToken.current) setRoom(null);
      } finally {
        if (token === lookupToken.current) setLooking(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [code]);

  const full = room && room.playerCount >= room.maxSeats;
  const started = room && room.phase !== 'waiting';

  async function handleJoin() {
    const clean = code.trim().toUpperCase();
    if (!room) return toast('Enter a valid room code first', 'error');

    try {
      const { account } = await ensureConnected();

      setStep(`Confirm the ${toEth(room.entryFeeWei)} ETH entry fee…`);
      const { txHash } = await joinGame({ code: clean, entryFeeWei: BigInt(room.entryFeeWei) });

      setStep('Taking your seat…');
      const { playerId } = await server.joinRoom({
        roomCode: clean,
        playerName: name.trim() || 'Player',
        address: account,
        txHash,
      });

      rememberName(name.trim());
      saveSession({ roomCode: clean, playerId, name: name.trim() });
      refreshBalance();
      navigate(`/room/${clean}`);
    } catch (error) {
      toast(readableError(error), 'error');
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label className="field__label" htmlFor="join-code">
          Room code
        </label>
        <input
          id="join-code"
          className="input input--code"
          value={code}
          maxLength={5}
          placeholder="7K9XM"
          autoComplete="off"
          spellCheck="false"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="player-name">
          Your name
        </label>
        <input
          id="player-name"
          className="input"
          value={name}
          maxLength={20}
          placeholder="e.g. Ram"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="lobby__preview">
        {looking && <p className="muted">Looking up that room…</p>}
        {!looking && code.length === 5 && !room && <p className="muted">No room with that code.</p>}
        {!looking && room && (
          <Panel>
            <div className="row row--between">
              <div>
                <p className="eyebrow">{room.hostName}'s table</p>
                <p className="muted">
                  {room.playerCount} of {room.maxSeats} seats taken
                </p>
              </div>
              <Badge tone="gold">{ethLabel(room.entryFeeWei)} to join</Badge>
            </div>
            {room.players?.length > 0 && (
              <p className="muted" style={{ marginTop: 'var(--s2)' }}>
                Already seated: {room.players.join(', ')}
              </p>
            )}
            {full && <p className="lobby__warn">This table is full.</p>}
            {started && !full && <p className="lobby__warn">This game has already started.</p>}
          </Panel>
        )}
      </div>

      <Button
        size="lg"
        full
        onClick={handleJoin}
        disabled={!room || full || started}
        busy={Boolean(step)}
      >
        {step || (room ? `Pay ${toEth(room.entryFeeWei)} ETH & sit down` : 'Enter a room code')}
      </Button>
    </div>
  );
}


function HowItWorks() {
  const steps = [
    ['1', 'Everyone pays in', 'The entry fee goes straight into the smart contract. That is the starting pot.'],
    ['2', 'Bet with real ETH', 'Every chaal, raise and show is its own transaction, added to the on-chain pot.'],
    ['3', 'Winner takes it all', 'One final transaction sends the whole pot — every fee and every bet — to the winner.'],
  ];

  return (
    <div className="how">
      {steps.map(([n, title, body]) => (
        <div key={n} className="how__step">
          <span className="how__num">{n}</span>
          <div>
            <p className="how__title">{title}</p>
            <p className="muted">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
