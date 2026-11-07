import React, { useRef } from 'react'
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { CompanionAction } from '@dsh-companion/protocol'

const SPRING = { damping: 14, stiffness: 380, mass: 0.7 } as const

export function PressSpring({ children, style }: { children: React.ReactNode; style?: object }): React.ReactElement {
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View style={[style, animated]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, SPRING) }}
        onPressOut={() => { scale.value = withSpring(1, SPRING) }}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

export function ActionButton(
  { action, onPress, busy }: { action: CompanionAction; onPress: () => void; busy?: boolean },
): React.ReactElement {
  const tint = action.style === 'approve' ? '#1f8a4c' : action.style === 'reject' ? '#b33636' : '#2a2f3d'
  const lastFired = useRef(0)
  const fire = (): void => {
    if (busy === true) return
    const now = Date.now()
    if (now - lastFired.current < 400) return
    lastFired.current = now
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onPress()
  }
  const stateStyle = ({ pressed }: PressableStateCallbackType): object => ({ opacity: pressed ? 0.85 : 1 })
  return (
    <PressSpring>
      <Pressable onPress={fire} style={stateStyle}>
        <View style={[styles.action, { backgroundColor: tint }]}>
          <Text style={styles.actionLabel}>{action.label}</Text>
        </View>
      </Pressable>
    </PressSpring>
  )
}

export function StatusDot({ state }: { state: 'ok' | 'down' | 'checking' }): React.ReactElement {
  const color = state === 'ok' ? '#2ecc71' : state === 'down' ? '#e74c3c' : '#f1c40f'
  const opacity = useSharedValue(state === 'checking' ? 0.4 : 1)
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View style={[styles.dot, animated, { backgroundColor: color }]} />
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  action: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
})
