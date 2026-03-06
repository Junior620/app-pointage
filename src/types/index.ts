import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type WhatsAppMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "location" | "interactive" | "button";
  text?: { body: string };
  location?: { latitude: number; longitude: number };
};

export type WhatsAppWebhookPayload = {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: WhatsAppMessage[];
        statuses?: Array<unknown>;
      };
      field: string;
    }>;
  }>;
};

export type Intent =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "STATUS"
  | "HELP"
  | "LOCATION"
  | "UNKNOWN";

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type AttendanceStats = {
  totalDays: number;
  onTimeDays: number;
  lateDays: number;
  absentDays: number;
  permissionDays: number;
  missionDays: number;
  totalMinutes: number;
  overtimeMinutes: number;
  punctualityRate: number;
  autoCheckouts: number;
};
