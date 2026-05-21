import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { FONTS, COLORS } from '../../constants';
import Badge from './Badge';

type Props = {
  label: string;
  meta?: string;
  badge?: number;
  dimmed?: boolean;
  icon?: string;
  onPress: () => void;
};

export default function Row({ label, meta, badge, dimmed, icon, onPress }: Props) {
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {icon && !iconFailed && (
        <Image
          source={{ uri: icon }}
          style={styles.icon}
          onError={() => setIconFailed(true)}
        />
      )}
      <View style={styles.content}>
        <Text
          style={[styles.label, dimmed && styles.labelDimmed]}
          numberOfLines={meta ? 2 : 1}
        >
          {label}
        </Text>
        {meta ? (
          <Text style={[styles.meta, dimmed && styles.metaDimmed]}>{meta}</Text>
        ) : null}
      </View>
      {badge !== undefined && <Badge count={badge} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  icon: {
    width: 18,
    height: 18,
    borderRadius: 3,
    marginRight: 10,
  },
  content: { flex: 1, marginRight: 8 },
  label: {
    fontFamily: FONTS.sansMedium,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  labelDimmed: {
    fontFamily: FONTS.sans,
    color: COLORS.textDimmed,
  },
  meta: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  metaDimmed: {
    color: COLORS.textDimmed,
  },
});
