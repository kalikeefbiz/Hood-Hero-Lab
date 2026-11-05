import { player, type GameState } from '../core/GameState';
import { saleLot } from '../systems/StreetEconomy';
import { LOCATIONS } from '../board/locations';
import { heatDescription } from '../systems/CriminalExposure';
/** Actions is an overview. Only a physically present City session can sell stock. */
export function StreetWork({ s, connects }: { s: GameState; connects: () => void }) {
  const lot = saleLot(s), p = player(s);
  return <section className="panel street-work" aria-label="Street operations">
    <p className="eyebrow">STREETS / CURRENT OPERATION</p>
    <h3>{lot ? `${lot.remaining} Pink Magic on hand` : 'Nothing to move right now.'}</h3>
    {lot ? <p>{s.characters[lot.supplier].name} · ${lot.owed} owed{lot.owed ? ` · due day ${lot.dueDay}` : ''}. Expected proceeds are not income.</p> : <button onClick={connects}>Find an arrangement in Connects →</button>}
    <p>Go to City, open a street spot, then Go here. While standing there, start trapping for 1 AP.</p>
    <ul>{LOCATIONS.filter(l => l.links.street && l.status === 'live').map(l => <li key={l.id}>{l.name} · {s.zones[l.zone].name}</li>)}</ul>
    <p className="muted">Heat: {heatDescription(p.police)} · Buyers may decline. Cash and stock can be lost; supplier balances remain owed.</p>
  </section>;
}
