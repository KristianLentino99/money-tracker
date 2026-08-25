import type { NotificationStruct } from '@/api/notifications';
import { ROUTES_NAMES } from '@/routes/constants';
import type { RecordId } from '@bt/shared/types';
import { NONEXISTENT_ID, NOTIFICATION_STATUSES, NOTIFICATION_TYPES, RESOURCE_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { buildNotificationRoute } from './build-notification-route';

const baseNotification = (overrides: Partial<NotificationStruct>): NotificationStruct =>
  ({
    id: 'n1' as RecordId,
    type: NOTIFICATION_TYPES.system,
    status: NOTIFICATION_STATUSES.unread,
    title: 'title',
    body: 'body',
    payload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    readAt: null,
    dismissedAt: null,
    ...overrides,
  }) as NotificationStruct;

describe('buildNotificationRoute', () => {
  describe('share_invitation_received', () => {
    it('returns SPA route to accounts with invitation_token query when token present', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareInvitationReceived,
          payload: {
            invitationId: 'inv-1',
            token: 'tok-abc',
            resourceType: RESOURCE_TYPES.account,
            resourceId: '42',
            resourceName: 'Wallet',
            permission: 'write',
            owner: { id: 1, username: 'alice', avatar: null },
          },
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.accounts, query: { invitation_token: 'tok-abc' } },
      });
    });

    it('returns null when payload is missing token', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareInvitationReceived,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: { invitationId: 'inv-1' } as any,
        }),
      );

      expect(route).toBeNull();
    });
  });

  describe('share_accepted', () => {
    it('returns SPA route to account with UUID id when resourceType=account', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareAccepted,
          payload: {
            resourceType: RESOURCE_TYPES.account,
            resourceId: NONEXISTENT_ID,
            resourceName: 'Joint',
            counterpartUser: { id: 2, username: 'bob', avatar: null },
          },
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.account, params: { id: NONEXISTENT_ID } },
      });
    });

    it('returns null when resourceId is empty', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareAccepted,
          payload: {
            resourceType: RESOURCE_TYPES.account,
            resourceId: '',
            resourceName: 'Joint',
            counterpartUser: { id: 2, username: 'bob', avatar: null },
          },
        }),
      );

      expect(route).toBeNull();
    });

    it('returns null when resourceType has no direct router target', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareAccepted,
          payload: {
            resourceType: RESOURCE_TYPES.plan,
            resourceId: NONEXISTENT_ID,
            resourceName: 'Monthly plan',
            counterpartUser: { id: 2, username: 'bob', avatar: null },
          },
        }),
      );

      expect(route).toBeNull();
    });
  });

  describe('non-actionable types', () => {
    it.each([
      NOTIFICATION_TYPES.system,
      NOTIFICATION_TYPES.changelog,
      NOTIFICATION_TYPES.tagReminder,
      NOTIFICATION_TYPES.shareDeclined,
      NOTIFICATION_TYPES.shareRevoked,
      NOTIFICATION_TYPES.shareLeft,
      NOTIFICATION_TYPES.shareExpired,
      NOTIFICATION_TYPES.shareOwnerAccountDeleted,
    ])('returns null for type "%s"', (type) => {
      const route = buildNotificationRoute(baseNotification({ type, payload: {} }));
      expect(route).toBeNull();
    });
  });

  describe('subscription_reminder', () => {
    it('returns SPA route to subscription details when subscriptionId present', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.subscriptionReminder,
          payload: { subscriptionId: NONEXISTENT_ID },
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.plannedSubscriptionDetails, params: { id: NONEXISTENT_ID } },
      });
    });

    it('returns null when subscriptionId is missing', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.subscriptionReminder,
          payload: {},
        }),
      );

      expect(route).toBeNull();
    });
  });

  describe('household_invitation_received', () => {
    it('returns SPA route to shared-with-me with invitation_token query when token present', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.householdInvitationReceived,
          payload: {
            invitationId: 'inv-1',
            token: 'tok-xyz',
            resourceType: RESOURCE_TYPES.household,
            resourceId: '7',
            resourceName: "alice's household",
            permission: 'read',
            owner: { id: 1, username: 'alice', avatar: null },
          },
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.settingsSharedWithMe, query: { invitation_token: 'tok-xyz' } },
      });
    });

    it('returns null when token missing', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.householdInvitationReceived,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: { invitationId: 'inv-1' } as any,
        }),
      );

      expect(route).toBeNull();
    });
  });

  describe('household owner-side lifecycle', () => {
    it.each([
      NOTIFICATION_TYPES.householdInvitationSendFailed,
      NOTIFICATION_TYPES.householdAccepted,
      NOTIFICATION_TYPES.householdDeclined,
      NOTIFICATION_TYPES.householdExpired,
      NOTIFICATION_TYPES.householdLeft,
      NOTIFICATION_TYPES.householdMemberAccountDeleted,
    ])('returns SPA route to settings → household for type "%s"', (type) => {
      const route = buildNotificationRoute(baseNotification({ type, payload: {} }));
      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.settingsHousehold },
      });
    });
  });

  describe('household recipient-side lifecycle', () => {
    it.each([
      NOTIFICATION_TYPES.householdPermissionChanged,
      NOTIFICATION_TYPES.householdRevoked,
      NOTIFICATION_TYPES.householdOwnerAccountDeleted,
    ])('returns SPA route to /shared-with-me for type "%s"', (type) => {
      const route = buildNotificationRoute(baseNotification({ type, payload: {} }));
      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.settingsSharedWithMe },
      });
    });
  });
});
