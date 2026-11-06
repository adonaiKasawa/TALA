import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, Button, Field, confirm, styles } from '../components/ui';
import { Icon } from '../components/Icon';
import { SocialIcon } from '../components/SocialIcon';
import { feedStyles as s } from './styles';
import type { FeedItem, Send } from './api';
import type { VideoSocial } from './useVideoSocial';
import { publicWebOrigin } from '../config';
import { Toast, ToastProvider } from '../components/Toast';
type Comment = {
  id: string;
  text: string;
  parentId: string | null;
  author: { username: string };
  canDelete: boolean;
};

export function SocialActions({
  item,
  send,
  panelChanged,
  creator,
  social,
}: {
  item: FeedItem;
  send: Send;
  panelChanged: (open: boolean) => void;
  creator: () => void;
  social: VideoSocial;
}) {
  const [comments, setComments] = useState(false),
    [avatarError, setAvatarError] = useState(false);
  const { summary, notice, busy, act, setNotice } = social;
  function button(
    label: string,
    icon: 'heart' | 'bookmark' | 'comment' | 'share',
    work: () => void,
    selected = false,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled: busy }}
        disabled={busy}
        onPress={work}
        style={s.railButton}
      >
        <SocialIcon
          name={icon}
          tone={selected ? (icon === 'heart' ? 'liked' : 'accent') : 'light'}
        />
        {icon === 'heart' && (
          <Text style={s.railCount}>{summary?.likes || 0}</Text>
        )}
      </Pressable>
    );
  }
  return (
    <>
      <View style={s.socialRail}>
        <View style={s.creatorAvatarStack}>
          <Pressable
            style={s.creatorAvatarLink}
            accessibilityRole="button"
            accessibilityLabel={'Profil de @' + item.creator.username}
            onPress={creator}
          >
            {item.creator.avatarUrl && !avatarError ? (
              <Image
                source={{ uri: item.creator.avatarUrl }}
                style={s.creatorAvatar}
                onError={() => setAvatarError(true)}
              />
            ) : (
              <View style={s.creatorAvatarFallback}>
                <Text style={s.creatorInitial}>
                  {(item.creator.displayName || item.creator.username)
                    .slice(0, 1)
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          {summary &&
            !summary.own &&
            !summary.following &&
            !summary.followRequested && (
              <Pressable
                style={s.followBadgeTarget}
                accessibilityRole="button"
                accessibilityLabel={'S’abonner à @' + item.creator.username}
                disabled={busy}
                onPress={() =>
                  act(() =>
                    send(
                      '/creators/' +
                        item.creator.username +
                        '/relations/follow',
                      'PUT',
                    ),
                  )
                }
              >
                <View style={s.followBadge}>
                  <Icon name="plus" tone="dark" size={14} />
                </View>
              </Pressable>
            )}
          {summary?.followRequested && (
            <Text style={s.followPending}>Demandé</Text>
          )}
        </View>
        {button(
          'J’aime · ' + (summary?.likes || 0),
          'heart',
          () =>
            act(() =>
              send(
                '/videos/' + item.id + '/reactions/like',
                summary?.liked ? 'DELETE' : 'PUT',
              ),
            ),
          summary?.liked,
        )}
        {button('Commentaires', 'comment', () => {
          setComments(true);
          panelChanged(true);
        })}
        {button(
          summary?.saved ? 'Enregistrée' : 'Enregistrer',
          'bookmark',
          () =>
            act(() =>
              send(
                '/videos/' + item.id + '/reactions/save',
                summary?.saved ? 'DELETE' : 'PUT',
              ),
            ),
          summary?.saved,
        )}
        {button('Partager', 'share', () => {
          if (!publicWebOrigin) {
            setNotice(
              'Le lien public sera disponible après configuration du domaine.',
            );
            return;
          }
          Share.share({
            message:
              item.title + ' ' + publicWebOrigin + '/regarder/' + item.id,
          }).catch(e => setNotice(e.message));
        })}
      </View>
      <Toast message={notice} dismiss={social.dismissNotice} />
      <Modal
        visible={comments}
        animationType="slide"
        onRequestClose={() => {
          setComments(false);
          panelChanged(false);
        }}
      >
        <ToastProvider>
          <SafeAreaView style={s.flex}>
            <Comments
              item={item}
              send={send}
              close={() => {
                setComments(false);
                panelChanged(false);
              }}
            />
          </SafeAreaView>
        </ToastProvider>
      </Modal>
    </>
  );
}
function Comments({
  item,
  send,
  close,
}: {
  item: FeedItem;
  send: Send;
  close: () => void;
}) {
  const [rows, setRows] = useState<Comment[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [text, setText] = useState(''),
    [reply, setReply] = useState<Comment | null>(null),
    [notice, setNotice] = useState('');
  const load = useCallback(
    async (after?: string) => {
      const page = await send<{ items: Comment[]; nextCursor: string | null }>(
        `/videos/${item.id}/comments${
          after ? '?cursor=' + encodeURIComponent(after) : ''
        }`,
      );
      setRows(old => (after ? [...old, ...page.items] : page.items));
      setCursor(page.nextCursor);
    },
    [item.id, send],
  );
  useEffect(() => {
    load().catch(e => setNotice(e.message));
  }, [load]);
  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={s.modal} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Commentaires</Text>
        <Button title="Fermer les commentaires" onPress={close} />
        {!!notice && (
          <Text accessibilityRole="alert" style={styles.error}>
            {notice}
          </Text>
        )}
        {!rows.length && (
          <Text style={styles.text}>Aucun commentaire pour le moment.</Text>
        )}
        {rows.map(c => (
          <View
            key={c.id}
            style={[s.comment, c.parentId ? s.reply : undefined]}
          >
            <Text style={styles.h2}>@{c.author.username}</Text>
            {c.parentId && (
              <Text style={styles.small}>En réponse à un commentaire</Text>
            )}
            <Text style={styles.text}>{c.text}</Text>
            {!c.parentId && (
              <Button secondary title="Répondre" onPress={() => setReply(c)} />
            )}
            {c.canDelete && (
              <Action
                title="Supprimer le commentaire"
                work={async () => {
                  if (
                    await confirm(
                      'Supprimer ce commentaire ?',
                      'Ses réponses seront également supprimées.',
                    )
                  ) {
                    await send(`/videos/${item.id}/comments/${c.id}`, 'DELETE');
                    await load();
                  }
                }}
              />
            )}
          </View>
        ))}
        {cursor && (
          <Action title="Voir plus de commentaires" work={() => load(cursor)} />
        )}
        {reply && (
          <>
            <Text style={styles.text}>Réponse à @{reply.author.username}</Text>
            <Button
              secondary
              title="Annuler la réponse"
              onPress={() => setReply(null)}
            />
          </>
        )}
        <Field
          label="Votre commentaire"
          multiline
          maxLength={1000}
          value={text}
          onChangeText={setText}
        />
        <Action
          title="Publier le commentaire"
          work={async () => {
            await send(`/videos/${item.id}/comments`, 'POST', {
              text,
              ...(reply ? { parentId: reply.id } : {}),
            });
            setText('');
            setReply(null);
            await load();
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
