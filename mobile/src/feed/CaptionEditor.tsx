import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Action, Button, Field, confirm, styles } from '../components/ui';
import { request } from '../services/session';
export function CaptionEditor({ id }: { id: string }) {
  const [open, setOpen] = useState(false),
    [language, setLanguage] = useState('fr'),
    [label, setLabel] = useState('Français'),
    [content, setContent] = useState('');
  return (
    <View>
      <Button
        secondary
        title="Gérer les sous-titres"
        onPress={() => setOpen(v => !v)}
      />
      {open && (
        <>
          <Text style={styles.text}>
            Collez le contenu WebVTT. Trois pistes maximum, 20 Ko chacune.
          </Text>
          <Field
            label="Code langue"
            value={language}
            onChangeText={setLanguage}
            maxLength={8}
            autoCapitalize="none"
          />
          <Field
            label="Nom de la piste"
            value={label}
            onChangeText={setLabel}
            maxLength={60}
          />
          <Field
            label="Contenu WebVTT"
            multiline
            value={content}
            onChangeText={setContent}
            maxLength={20000}
            autoCapitalize="none"
          />
          <Action
            title="Enregistrer les sous-titres"
            work={async () => {
              if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(language))
                throw new Error('Code langue invalide.');
              await request(
                `/videos/${id}/captions/${language}`,
                'api',
                'PUT',
                { label, content },
              );
            }}
          />
          <Action
            title="Supprimer cette piste"
            work={async () => {
              if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(language))
                throw new Error('Code langue invalide.');
              if (await confirm('Supprimer cette piste ?', language))
                await request(
                  `/videos/${id}/captions/${language}`,
                  'api',
                  'DELETE',
                );
            }}
          />
        </>
      )}
    </View>
  );
}
