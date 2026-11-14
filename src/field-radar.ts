export type FieldRadarRole = 'fielder' | 'bowler' | 'striker' | 'non-striker';
export type FieldRadarTeam = 'batting' | 'fielding';

export interface FieldRadarPlayer {
  key: string;
  label: string;
  shortLabel: string;
  role: FieldRadarRole;
  team: FieldRadarTeam;
  x: number;
  z: number;
}

export interface FieldRadarPoint {
  x: number;
  y: number;
}

export const FIELD_RADAR_VIEW_SIZE = 200;
export const FIELD_RADAR_BOUNDARY_RADIUS_METERS = 65;
const FIELD_RADAR_INSET = 12;

/** Project the stadium's X/Z world plane into a bowler-end-up radar. */
export function fieldRadarPoint(x: number, z: number): FieldRadarPoint {
  if (![x, z].every(Number.isFinite)) throw new Error('Field radar coordinates must be finite');
  const scale = (FIELD_RADAR_VIEW_SIZE / 2 - FIELD_RADAR_INSET) / FIELD_RADAR_BOUNDARY_RADIUS_METERS;
  return {
    x: FIELD_RADAR_VIEW_SIZE / 2 + x * scale,
    y: FIELD_RADAR_VIEW_SIZE / 2 - z * scale,
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<T extends SVGElement>(tag: string): T {
  return document.createElementNS(SVG_NS, tag) as T;
}

function makePlayerMarker(player: FieldRadarPlayer): SVGGElement {
  const group = svgElement<SVGGElement>('g');
  group.classList.add('field-radar-marker', `role-${player.role}`, `team-${player.team}`);
  group.dataset.playerKey = player.key;
  group.dataset.playerRole = player.role;
  group.dataset.team = player.team;
  group.setAttribute('aria-label', player.label);

  if (player.role === 'bowler') {
    const shape = svgElement<SVGPathElement>('path');
    shape.setAttribute('d', 'M0 -7 L6 5 L-6 5 Z');
    group.append(shape);
  } else if (player.role === 'non-striker') {
    const shape = svgElement<SVGRectElement>('rect');
    shape.setAttribute('x', '-4.5');
    shape.setAttribute('y', '-4.5');
    shape.setAttribute('width', '9');
    shape.setAttribute('height', '9');
    group.append(shape);
  } else {
    const shape = svgElement<SVGCircleElement>('circle');
    shape.setAttribute('r', player.role === 'striker' ? '6.4' : '5.4');
    group.append(shape);
  }

  const shortLabel = svgElement<SVGTextElement>('text');
  shortLabel.classList.add('field-radar-marker-label');
  shortLabel.setAttribute('text-anchor', 'middle');
  shortLabel.setAttribute('dominant-baseline', 'central');
  shortLabel.textContent = player.shortLabel;
  group.append(shortLabel);

  const title = svgElement<SVGTitleElement>('title');
  title.textContent = player.label;
  group.append(title);
  return group;
}

/** Reconcile SVG markers so live scene movement only updates coordinates. */
export function renderFieldRadarMarkers(layer: SVGGElement, players: readonly FieldRadarPlayer[]): void {
  const expected = new Set(players.map(player => player.key));
  for (const child of Array.from(layer.querySelectorAll<SVGGElement>('.field-radar-marker'))) {
    if (!expected.has(child.dataset.playerKey ?? '')) child.remove();
  }

  for (const player of players) {
    let marker = Array.from(layer.querySelectorAll<SVGGElement>('.field-radar-marker'))
      .find(candidate => candidate.dataset.playerKey === player.key);
    if (!marker) {
      marker = makePlayerMarker(player);
      layer.append(marker);
    }
    marker.classList.toggle('team-batting', player.team === 'batting');
    marker.classList.toggle('team-fielding', player.team === 'fielding');
    marker.dataset.playerRole = player.role;
    marker.dataset.team = player.team;
    marker.dataset.shortLabel = player.shortLabel;
    marker.setAttribute('aria-label', player.label);
    const title = marker.querySelector('title');
    if (title) title.textContent = player.label;
    const shortLabel = marker.querySelector('.field-radar-marker-label');
    if (shortLabel) shortLabel.textContent = player.shortLabel;
    const point = fieldRadarPoint(player.x, player.z);
    marker.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
  }
}
