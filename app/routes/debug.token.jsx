import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Debug endpoint to show access token for your shop
export async function loader({ request }) {
  try {
    const { session, admin } = await authenticate.admin(request);
    
    return json({
      shop: session.shop,
      accessToken: session.accessToken,
      scope: session.scope,
      message: "Use this access token to set SHOPIFY_ACCESS_TOKEN environment variable"
    });
    
  } catch (error) {
    return json({
      error: "Authentication failed",
      message: error.message
    }, { status: 401 });
  }
}
