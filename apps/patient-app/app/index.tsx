import { StyleSheet, Text, View } from 'react-native';

// Placeholder start screen from KAN-5. KAN-14 replaces it with a redirect to
// the (auth) or (tabs) group, depending on whether the patient is logged in.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text>Wasla</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
