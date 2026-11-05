import { Link } from "react-router-dom";

// PHASE 2 owns this component: show the signed-in username + sign out, or a Sign in link.
export function AccountBadge() {
  return <Link to="/login" className="account">Sign in</Link>;
}
