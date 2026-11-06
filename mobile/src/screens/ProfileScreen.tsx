import React, { useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import {
  Action,
  Button,
  Field,
  Screen,
  Section,
  styles,
  colors,
} from '../components/ui';
import { request } from '../services/session';
import type { Profile } from '../types';
export function ProfileScreen({
  profile,
  reload,
  preview,
}: {
  profile: Profile | null;
  reload: () => Promise<void>;
  preview: () => void;
}) {
  const [name, setName] = useState(profile?.displayName || ''),
    [username, setUsername] = useState(profile?.username || ''),
    [avatar, setAvatar] = useState(profile?.avatarUrl || ''),
    [bio, setBio] = useState(profile?.bio || '');
  const [country, setCountry] = useState(profile?.preferences.country || ''),
    [languages, setLanguages] = useState(
      profile?.preferences.languages.join(', ') || '',
    ),
    [interests, setInterests] = useState(
      profile?.preferences.interests.join(', ') || '',
    ),
    [locale, setLocale] = useState(profile?.preferences.locale || 'fr');
  const [isPrivate, setPrivate] = useState(profile?.isPrivate || false),
    [links, setLinks] = useState(profile?.links || []);
  const split = (value: string) =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  return (
    <Screen
      title={profile ? 'Mon profil' : 'Présentez-vous'}
      subtitle="Choisissez ce que la communauté voit de vous."
    >
      <Section title="Votre présentation">
        {avatar.startsWith('https://') ? (
          <Image
            source={{ uri: avatar }}
            style={styles.avatar}
            accessibilityLabel="Votre photo de profil"
          />
        ) : (
          <View style={styles.avatarLetter}>
            <Text style={styles.h2}>{(name || 'T')[0].toUpperCase()}</Text>
          </View>
        )}
        <Field
          label="Nom affiché"
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoCapitalize="words"
        />
        <Field
          label="Pseudonyme"
          value={username}
          onChangeText={setUsername}
          maxLength={30}
          autoComplete="username"
        />
        <Field
          label="Adresse de votre photo (HTTPS)"
          value={avatar}
          onChangeText={setAvatar}
          keyboardType="url"
        />
        <Field
          label="Biographie"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
          autoCapitalize="sentences"
        />
      </Section>
      <Section title="Vos liens">
        {links.map((link, index) => (
          <View key={index} style={styles.divider}>
            <Field
              label={`Nom du lien ${index + 1}`}
              value={link.label}
              maxLength={40}
              onChangeText={value =>
                setLinks(
                  links.map((item, i) =>
                    i === index ? { ...item, label: value } : item,
                  ),
                )
              }
            />
            <Field
              label={`Adresse du lien ${index + 1}`}
              value={link.url}
              keyboardType="url"
              onChangeText={value =>
                setLinks(
                  links.map((item, i) =>
                    i === index ? { ...item, url: value } : item,
                  ),
                )
              }
            />
            <Button
              secondary
              title={`Retirer le lien ${index + 1}`}
              onPress={() => setLinks(links.filter((_, i) => i !== index))}
            />
          </View>
        ))}
        {links.length < 5 && (
          <Button
            secondary
            title="Ajouter un lien"
            onPress={() => setLinks([...links, { label: '', url: '' }])}
          />
        )}
      </Section>
      <Section title="Préférences personnelles">
        <Text style={styles.small}>
          Ces informations sont visibles uniquement par vous.
        </Text>
        <Field
          label="Langues, séparées par des virgules"
          value={languages}
          onChangeText={setLanguages}
          placeholder="fr, ln-CD"
        />
        <Field
          label="Pays (deux lettres)"
          value={country}
          onChangeText={setCountry}
          autoCapitalize="characters"
          maxLength={2}
          placeholder="CD"
        />
        <Field
          label="Centres d’intérêt, séparés par des virgules"
          value={interests}
          onChangeText={setInterests}
        />
        <Field
          label="Langue de l’interface"
          value={locale}
          onChangeText={setLocale}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>Profil privé</Text>
            <Text style={styles.small}>
              Masquer ma biographie et mes liens aux visiteurs.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Profil privé"
            value={isPrivate}
            onValueChange={setPrivate}
            trackColor={{ false: colors.line, true: colors.blue }}
          />
        </View>
      </Section>
      <Action
        title={profile ? 'Enregistrer les changements' : 'Créer mon profil'}
        work={async () => {
          await request('/me/profile', 'api', profile ? 'PATCH' : 'POST', {
            displayName: name,
            username,
            avatarUrl: avatar || null,
            bio,
            links,
            isPrivate,
            country: country || null,
            languages: split(languages),
            interests: split(interests),
            locale,
          });
          await reload();
        }}
      />
      {profile && (
        <Button secondary title="Voir mon profil public" onPress={preview} />
      )}
    </Screen>
  );
}
