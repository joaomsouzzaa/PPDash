const FB_APP_ID = "24154258840827764";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

let sdkLoaded = false;
let sdkPromise: Promise<void> | null = null;

export function loadFacebookSDK(): Promise<void> {
  if (sdkLoaded) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      sdkLoaded = true;
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });

  return sdkPromise;
}

export interface FBLoginResult {
  status: "connected" | "not_authorized" | "unknown";
  userName?: string;
  accessToken?: string;
}

export function loginWithFacebook(): Promise<FBLoginResult> {
  return new Promise((resolve) => {
    window.FB.login(
      (response: any) => {
        if (response.authResponse) {
          const accessToken = response.authResponse.accessToken;
          window.FB.api("/me", { fields: "name" }, (userInfo: any) => {
            resolve({
              status: "connected",
              userName: userInfo.name,
              accessToken,
            });
          });
        } else {
          resolve({ status: response.status || "unknown" });
        }
      },
      { scope: "ads_read,ads_management,business_management" }
    );
  });
}

export function logoutFromFacebook(): Promise<void> {
  return new Promise((resolve) => {
    window.FB.logout(() => resolve());
  });
}
