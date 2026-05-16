import { View, Text, StyleSheet } from 'react-native';
import { FONTS, COLORS } from '../../constants';

type Props = { count: number };

export default function Badge({ count }: Props) {
  if (count === 0) return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
  },
  text: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: '#fff',
  },
});
