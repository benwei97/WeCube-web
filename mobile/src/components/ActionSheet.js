import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export default function ActionSheet({ visible, title, actions = [], onClose }) {
  function runAction(action) {
    if (action.disabled) return;
    onClose?.();
    action.onPress?.();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <View style={styles.actionList}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                style={[styles.actionButton, action.disabled && styles.disabledAction]}
                onPress={() => runAction(action)}
                disabled={action.disabled}
              >
                <Text
                  style={[
                    styles.actionText,
                    action.destructive && styles.destructiveText,
                    action.disabled && styles.disabledText,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.36)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 16,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 42,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
  },
  actionList: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  actionButton: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  destructiveText: {
    color: colors.danger,
  },
  disabledAction: {
    opacity: 0.5,
  },
  disabledText: {
    color: colors.muted,
  },
  cancelButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  cancelText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "900",
  },
});
