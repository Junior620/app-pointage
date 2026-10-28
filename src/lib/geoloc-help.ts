/**
 * Aide affichée quand le navigateur refuse ou ne trouve pas la position, adaptée au téléphone.
 * Sur iPhone, autoriser la position dans Safari ne suffit pas : iOS a son propre réglage
 * (Service de localisation → Sites web Safari) qui, sur « Jamais », bloque tous les sites.
 */

export type GeoPlatform = "ios-safari" | "ios-browser" | "android" | "other";

export type GeoDevice = { platform: GeoPlatform; browser: string };

export type GeoHelp = {
  message: string;
  steps: string[];
  /** Après un refus, Safari ne redemande pas l'autorisation sans recharger la page. */
  reloadToRetry: boolean;
};

const IOS_OTHER_BROWSERS: [RegExp, string][] = [
  [/CriOS/i, "Chrome"],
  [/FxiOS/i, "Firefox"],
  [/EdgiOS/i, "Edge"],
  [/OPiOS|OPT\//i, "Opera"],
];

export function detectGeoDevice(userAgent: string, { platform = "", maxTouchPoints = 0 } = {}): GeoDevice {
  // Les iPad récents se présentent comme un Mac : on les reconnaît à l'écran tactile.
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (ios) {
    const other = IOS_OTHER_BROWSERS.find(([re]) => re.test(userAgent));
    // Safari et le navigateur intégré de WhatsApp suivent les réglages « Sites web Safari ».
    return other ? { platform: "ios-browser", browser: other[1] } : { platform: "ios-safari", browser: "Safari" };
  }
  if (/Android/i.test(userAgent)) return { platform: "android", browser: "" };
  return { platform: "other", browser: "" };
}

const IOS_LOCATION_SERVICES = "Ouvrez Réglages → Confidentialité et sécurité → Service de localisation, et activez-le.";
const REOPEN_LINK = "Si rien ne change, fermez cet onglet et rouvrez le lien reçu sur WhatsApp.";

/** Accès à la position refusé (autorisation du site, du navigateur ou du téléphone). */
export function permissionDeniedHelp({ platform, browser }: GeoDevice): GeoHelp {
  switch (platform) {
    case "ios-safari":
      return {
        message: "Votre iPhone bloque l'accès à votre position pour ce site.",
        steps: [
          IOS_LOCATION_SERVICES,
          "Dans la même liste, touchez « Sites web Safari » → « Lorsque l'app est active », puis activez « Position exacte ».",
          "Revenez ici : touchez l'icône à gauche de l'adresse → « Réglages du site web » → « Position » → « Autoriser ».",
          "Touchez « Réessayer » et acceptez la demande de position.",
          REOPEN_LINK,
        ],
        reloadToRetry: true,
      };
    case "ios-browser":
      return {
        message: `Votre iPhone bloque l'accès à votre position pour ${browser}.`,
        steps: [
          IOS_LOCATION_SERVICES,
          `Dans la même liste, touchez « ${browser} » → « Lorsque l'app est active », puis activez « Position exacte ».`,
          "Touchez « Réessayer » et acceptez la demande de position.",
          REOPEN_LINK,
        ],
        reloadToRetry: true,
      };
    case "android":
      return {
        message: "Le navigateur bloque l'accès à votre position pour ce site.",
        steps: [
          "Touchez l'icône à gauche de l'adresse du site → « Autorisations » → « Position » → « Autoriser ».",
          "Vérifiez que la localisation du téléphone est activée (volet des réglages rapides).",
          "Touchez « Réessayer » et acceptez la demande de position.",
        ],
        reloadToRetry: true,
      };
    default:
      return {
        message: "Le navigateur bloque l'accès à votre position pour ce site.",
        steps: [
          "Cliquez sur l'icône à gauche de l'adresse du site et autorisez la position.",
          "Cliquez sur « Réessayer ».",
        ],
        reloadToRetry: true,
      };
  }
}

/** Position introuvable (localisation coupée, pas de signal). */
export function positionUnavailableHelp({ platform }: GeoDevice): GeoHelp {
  const ios = platform === "ios-safari" || platform === "ios-browser";
  return {
    message: "Position indisponible.",
    steps: [
      ios ? IOS_LOCATION_SERVICES : "Activez la localisation (GPS) du téléphone.",
      "Rapprochez-vous d'une fenêtre ou sortez, puis touchez « Réessayer ».",
    ],
    reloadToRetry: false,
  };
}
