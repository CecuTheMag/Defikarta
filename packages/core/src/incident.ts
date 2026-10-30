/** Incident and assignment state machines (BLUEPRINT §5). Pure: the server and the tests share this table. */

export type IncidentState =
  | 'DISPATCHING'
  | 'RESPONDING'
  | 'ON_SCENE'
  | 'AED_ON_SCENE'
  | 'DISPATCH_FAILED'
  | 'EMS_ON_SCENE'
  | 'CLOSED';

export type IncidentEvent =
  | 'wave_timeout_next'
  | 'wave_timeout_failed'
  | 'offer_accepted'
  | 'on_scene'
  | 'aed_on_scene'
  | 'ems_on_scene'
  | 'cancel'
  | 'close';

const ACTIVE: IncidentState[] = ['DISPATCHING', 'RESPONDING', 'ON_SCENE', 'AED_ON_SCENE'];

/** `null` = the transition is not allowed from this state. */
export function nextIncidentState(state: IncidentState, event: IncidentEvent): IncidentState | null {
  if (state === 'CLOSED') return null;
  switch (event) {
    case 'wave_timeout_next':
      return state === 'DISPATCHING' ? 'DISPATCHING' : null;
    case 'wave_timeout_failed':
      return state === 'DISPATCHING' ? 'DISPATCH_FAILED' : null;
    case 'offer_accepted':
      return state === 'DISPATCHING' ? 'RESPONDING' : state === 'RESPONDING' || state === 'ON_SCENE' || state === 'AED_ON_SCENE' ? state : null;
    case 'on_scene':
      return state === 'RESPONDING' ? 'ON_SCENE' : state === 'ON_SCENE' || state === 'AED_ON_SCENE' ? state : null;
    case 'aed_on_scene':
      return state === 'RESPONDING' || state === 'ON_SCENE' || state === 'AED_ON_SCENE' ? 'AED_ON_SCENE' : null;
    case 'ems_on_scene':
      return ACTIVE.includes(state) || state === 'DISPATCH_FAILED' ? 'EMS_ON_SCENE' : null;
    case 'cancel':
    case 'close':
      return 'CLOSED';
  }
}

export function isActive(state: IncidentState): boolean {
  return ACTIVE.includes(state);
}

/** Replaying an append-only event log must always give the same state (BLUEPRINT principle 7). */
export function replayIncident(events: IncidentEvent[]): IncidentState {
  let s: IncidentState = 'DISPATCHING';
  for (const e of events) s = nextIncidentState(s, e) ?? s;
  return s;
}

export type AssignmentRole = 'cpr' | 'aed_runner';
export type AssignmentStatus = 'en_route' | 'on_scene' | 'aed_collected' | 'aed_on_scene' | 'released';

/** Allowed progress steps for one assignment. */
export function nextAssignmentStatus(role: AssignmentRole, status: AssignmentStatus, step: 'on_scene' | 'aed_collected' | 'aed_on_scene'): AssignmentStatus | null {
  if (status === 'released') return null;
  if (role === 'cpr') return step === 'on_scene' && status === 'en_route' ? 'on_scene' : null;
  if (step === 'aed_collected') return status === 'en_route' ? 'aed_collected' : null;
  if (step === 'aed_on_scene') return status === 'aed_collected' ? 'aed_on_scene' : null;
  return null;
}
