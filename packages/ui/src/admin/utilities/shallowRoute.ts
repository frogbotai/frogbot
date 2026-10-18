/**
 * The `history.state` key on an entry the admin moved to another page with `history.replaceState`,
 * so the view stays mounted. A host whose router can't restore such an entry on Back or Forward
 * navigates to it instead.
 */
export const shallowRouteState = 'frogbotShallowRoute';
