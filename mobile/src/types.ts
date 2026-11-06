export type Profile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  links: { label: string; url: string }[];
  isPrivate: boolean;
  preferences: {
    languages: string[];
    country: string | null;
    interests: string[];
    locale: string;
  };
};
export type Identity = {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
};
export type ViewState = { identity: Identity; profile: Profile | null };
