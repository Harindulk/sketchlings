import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Title} from '../components/Bits';
import {FocusButton} from '../components/FocusButton';
import {clearHall, consent, setAiPersonas} from '../game/party';
import {C, F} from '../theme';

/** Parent gate: a times-table question with four answers for the D-pad. One try; a wrong answer goes back Home. */
function gate() {
  const a = 6 + Math.floor(Math.random() * 4); // 6-9
  const b = 6 + Math.floor(Math.random() * 4);
  const answer = a * b;
  const options = [answer, answer + a, answer - b, answer + 10]; // all different, since a, b < 10
  return {
    text: `What is ${a} × ${b}?`,
    answer,
    options: options.sort(() => Math.random() - 0.5),
  };
}

/** Grown-ups settings behind the gate: the AI personas consent and Clear Hall of Fame. Plain cards, no art. */
export function GrownUps({
  onDone,
  onCleared,
}: {
  onDone: () => void;
  onCleared: () => void;
}) {
  const q = useMemo(gate, []);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState(consent.aiPersonas);
  const [step, setStep] = useState<'idle' | 'ask' | 'back'>('idle'); // 'back': focus returns to Clear
  const [msg, setMsg] = useState('');
  const busy = msg === 'Clearing…';

  if (!open) {
    return (
      <View style={styles.root}>
        <Title size={44} style={styles.title}>
          Grown-ups only
        </Title>
        <Text style={styles.body}>Answer to open the settings:</Text>
        <Text style={styles.question}>{q.text}</Text>
        <View style={styles.row}>
          {q.options.map((n) => (
            <FocusButton
              key={n}
              label={String(n)}
              preferred={n === q.options.find((o) => o !== q.answer)} // mashing OK never opens it
              color="#2bb3ff"
              onPress={() => (n === q.answer ? setOpen(true) : onDone())}
              style={styles.answer}>
              <Text style={styles.answerText}>{n}</Text>
            </FocusButton>
          ))}
        </View>
        <Text style={styles.hint}>A wrong answer goes back to Home.</Text>
      </View>
    );
  }

  const del = () => {
    setStep('back');
    setMsg('Clearing…');
    clearHall().then(
      (n) => {
        setMsg(`Done: ${n} ${n === 1 ? 'creature' : 'creatures'} deleted.`);
        onCleared();
      },
      (e: Error) => setMsg(e.message || 'That did not work. Try again.'),
    );
  };

  return (
    <View style={styles.root}>
      <Title size={44} style={styles.title}>
        Grown-ups
      </Title>
      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI personas</Text>
          <Text style={styles.body}>
            On: each drawing is sent to Claude, an AI from Anthropic, to make up
            its name and story. Off: the party server makes them itself, and no
            drawing goes to the AI.
          </Text>
          <FocusButton
            label={`AI personas ${ai ? 'on' : 'off'}`}
            preferred
            color="#3ddc84"
            onPress={() => {
              setAiPersonas(!ai);
              setAi(!ai);
            }}
            style={styles.btn}
            cardStyle={ai && styles.on}>
            <Text style={styles.btnText}>AI personas: {ai ? 'ON' : 'OFF'}</Text>
          </FocusButton>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hall of Fame</Text>
          <Text style={styles.body}>
            Deletes every saved creature, with its picture and voice clips, from
            the party server. It can't be undone.
          </Text>
          {step === 'ask' ? (
            <View style={styles.askRow}>
              <FocusButton
                label="Delete them all"
                color="#ff5a5f"
                onPress={del}
                style={styles.askBtn}
                cardStyle={styles.danger}>
                <Text style={styles.btnText}>Delete all</Text>
              </FocusButton>
              <FocusButton
                label="Keep them"
                preferred
                color="#3ddc84"
                onPress={() => setStep('back')}
                style={styles.askBtn}>
                <Text style={styles.btnText}>Keep</Text>
              </FocusButton>
            </View>
          ) : (
            <FocusButton
              label="Clear Hall of Fame"
              preferred={step === 'back'}
              color="#ff5a5f"
              onPress={() => !busy && setStep('ask')}
              style={styles.btn}>
              <Text style={styles.btnText}>Clear Hall of Fame</Text>
            </FocusButton>
          )}
          <Text style={styles.status} numberOfLines={2}>
            {step === 'ask' ? 'Sure? Every creature goes.' : msg}
          </Text>
        </View>
      </View>
      <FocusButton
        label="Done"
        color="#2bb3ff"
        onPress={onDone}
        style={styles.done}>
        <Text style={styles.btnText}>Done</Text>
      </FocusButton>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, alignItems: 'center'},
  title: {marginTop: 28},
  row: {flexDirection: 'row', marginTop: 18},
  question: {
    fontFamily: F.bold,
    fontSize: 52,
    lineHeight: 64,
    color: C.ink,
    marginTop: 8,
  },
  answer: {width: 120, height: 84, marginHorizontal: 16, marginTop: 10},
  answerText: {fontFamily: F.bold, fontSize: 38, lineHeight: 48, color: C.ink},
  hint: {fontFamily: F.semi, fontSize: 18, color: C.inkSoft, marginTop: 40},
  card: {
    width: 400,
    height: 300,
    marginHorizontal: 14,
    padding: 18,
    backgroundColor: C.white,
    borderWidth: 4,
    borderColor: C.ink,
    borderRadius: 22,
  },
  cardTitle: {fontFamily: F.bold, fontSize: 30, lineHeight: 38, color: C.ink},
  body: {fontFamily: F.semi, fontSize: 18, lineHeight: 23, color: C.inkSoft},
  btn: {width: 300, height: 56, marginTop: 16, alignSelf: 'center'},
  btnText: {fontFamily: F.bold, fontSize: 22, lineHeight: 30, color: C.ink},
  on: {backgroundColor: '#3ddc84'},
  danger: {backgroundColor: '#ff5a5f'},
  askRow: {flexDirection: 'row', justifyContent: 'space-around', marginTop: 16},
  askBtn: {width: 150, height: 56},
  status: {
    fontFamily: F.semi,
    fontSize: 17,
    lineHeight: 22,
    color: C.ink,
    marginTop: 10,
    textAlign: 'center',
  },
  done: {width: 180, height: 58, marginTop: 30},
});
