import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Paths } from 'expo-file-system';
import { saveDbConfig } from '../src/db/config';
import { notifySetupComplete } from '../src/db/setup-complete';
import { getICloudContainerPath } from 'fressh-icloud';
import { COLORS, FONTS } from '../src/constants';

type Mode = 'app' | 'icloud' | 'custom';

export default function SetupScreen() {
  const [mode, setMode] = useState<Mode>('app');
  const [customPath, setCustomPath] = useState('');
  const [icloudPath, setIcloudPath] = useState<string | null>(null);
  const [icloudError, setIcloudError] = useState<string | null>(null);
  const [icloudLoading, setIcloudLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== 'icloud') return;
    setIcloudLoading(true);
    setIcloudError(null);
    setIcloudPath(null);
    getICloudContainerPath()
      .then(path => {
        setIcloudPath(path);
        setIcloudLoading(false);
      })
      .catch(err => {
        setIcloudError(err.message ?? 'iCloud not available');
        setIcloudLoading(false);
      });
  }, [mode]);

  async function handleConfirm() {
    let dbPath: string;
    if (mode === 'app') {
      const docUri = Paths.document.uri.replace(/^file:\/\//, '').replace(/\/$/, '');
      dbPath = docUri + '/SQLite/fressh.db';
    } else if (mode === 'icloud') {
      if (!icloudPath) {
        Alert.alert('iCloud not available', icloudError ?? 'Could not resolve iCloud path.');
        return;
      }
      dbPath = icloudPath;
    } else {
      const trimmed = customPath.trim();
      if (!trimmed) {
        Alert.alert('Path required', 'Enter an absolute path for the database file.');
        return;
      }
      dbPath = trimmed;
    }
    setSaving(true);
    try {
      await saveDbConfig({ databasePath: dbPath });
      notifySetupComplete();
    } catch {
      Alert.alert('Error', 'Could not save configuration. Try again.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.title}>FRESSH</Text>
        <Text style={styles.subtitle}>Choose where to store your database</Text>

        <TouchableOpacity style={[styles.option, mode === 'app' && styles.optionSelected]} onPress={() => setMode('app')} activeOpacity={0.7}>
          <Text style={[styles.optionLabel, mode === 'app' && styles.optionLabelSelected]}>App Storage</Text>
          <Text style={styles.optionDesc}>Stored privately on this device. Fast, zero setup.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.option, mode === 'icloud' && styles.optionSelected]} onPress={() => setMode('icloud')} activeOpacity={0.7}>
          <Text style={[styles.optionLabel, mode === 'icloud' && styles.optionLabelSelected]}>iCloud Drive</Text>
          <Text style={styles.optionDesc}>Sync read state and subscriptions with other devices and the Fressh terminal app.</Text>
        </TouchableOpacity>

        {mode === 'icloud' && (
          <View style={styles.icloudStatus}>
            {icloudLoading && <ActivityIndicator size="small" color={COLORS.accent} />}
            {!icloudLoading && icloudPath && (
              <Text style={styles.icloudPath} numberOfLines={2}>{icloudPath}</Text>
            )}
            {!icloudLoading && icloudError && (
              <Text style={styles.icloudPathError}>{icloudError}</Text>
            )}
          </View>
        )}

        <TouchableOpacity style={[styles.option, mode === 'custom' && styles.optionSelected]} onPress={() => setMode('custom')} activeOpacity={0.7}>
          <Text style={[styles.optionLabel, mode === 'custom' && styles.optionLabelSelected]}>Custom Path</Text>
          <Text style={styles.optionDesc}>Enter an absolute path — for advanced sync setups.</Text>
        </TouchableOpacity>

        {mode === 'custom' && (
          <TextInput
            style={styles.input}
            placeholder="/path/to/fressh.db"
            placeholderTextColor={COLORS.textDimmed}
            value={customPath}
            onChangeText={setCustomPath}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        )}

        <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={handleConfirm} disabled={saving} activeOpacity={0.8}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 80 },
  title: { fontFamily: FONTS.sansBold, fontSize: 22, color: COLORS.text, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  subtitle: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.textSecondary, marginBottom: 32 },
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 3,
    padding: 16,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
  },
  optionSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.background },
  optionLabel: { fontFamily: FONTS.sansMedium, fontSize: 14, color: COLORS.text, marginBottom: 4 },
  optionLabelSelected: { color: COLORS.accent },
  optionDesc: { fontFamily: FONTS.sans, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  icloudStatus: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    minHeight: 24,
    justifyContent: 'center',
  },
  icloudPath: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  icloudPathError: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#c0392b',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    marginBottom: 12,
  },
  btn: { backgroundColor: COLORS.accent, borderRadius: 3, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: FONTS.sansBold, fontSize: 14, color: '#fff' },
});
