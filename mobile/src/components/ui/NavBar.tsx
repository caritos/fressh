import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FONTS, COLORS } from '../../constants';

type Props = {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  paddingBottom?: number;
};

export default function NavBar({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  paddingBottom = 0,
}: Props) {
  return (
    <View style={[styles.bar, { paddingBottom }]}>
      <TouchableOpacity style={styles.btn} onPress={onPrev} disabled={prevDisabled}>
        <Text style={[styles.btnText, prevDisabled && styles.btnTextDisabled]}>
          ‹ Prev
        </Text>
      </TouchableOpacity>
      <View style={styles.divider} />
      <TouchableOpacity style={styles.btn} onPress={onNext} disabled={nextDisabled}>
        <Text style={[styles.btnText, nextDisabled && styles.btnTextDisabled]}>
          Next ›
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 52,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  btnText: {
    fontFamily: FONTS.sansBold,
    fontSize: 15,
    color: COLORS.accent,
  },
  btnTextDisabled: {
    color: COLORS.textDimmed,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
});
