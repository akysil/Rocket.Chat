import type { IMessage } from '@rocket.chat/core-typings';
import { useEndpoint, useStream } from '@rocket.chat/ui-contexts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import MessageListTab from './MessageListTab';
import { onClientMessageReceived } from '../../../lib/onClientMessageReceived';
import { roomsQueryKeys } from '../../../lib/queryKeys';
import { mapMessageFromApi } from '../../../lib/utils/mapMessageFromApi';
import { useRoom } from '../contexts/RoomContext';

const StarredMessagesTab = () => {
	const getStarredMessages = useEndpoint('GET', '/v1/chat.getStarredMessages');

	const room = useRoom();

	const starredMessagesQueryResult = useQuery({
		queryKey: roomsQueryKeys.starredMessages(room._id),
		queryFn: async () => {
			const messages: IMessage[] = [];

			for (
				let offset = 0, result = await getStarredMessages({ roomId: room._id, offset: 0 });
				result.count > 0;
				offset += result.count, result = await getStarredMessages({ roomId: room._id, offset })
			) {
				messages.push(...result.messages.map(mapMessageFromApi));
			}

			return Promise.all(messages.map(onClientMessageReceived));
		},
	});

	const queryClient = useQueryClient();
	const subscribeToRoomMessages = useStream('room-messages');

	useEffect(
		() =>
			subscribeToRoomMessages(room._id, async (event) => {
				const queryKey = roomsQueryKeys.starredMessages(room._id);
				if (queryClient.isFetching({ queryKey })) {
					await queryClient.cancelQueries({ queryKey });
					await queryClient.invalidateQueries({ queryKey });
					return;
				}

				if (!queryClient.getQueryData<IMessage[]>(queryKey)?.some(({ _id }) => _id === event._id)) {
					return;
				}

				const message = await onClientMessageReceived(event);
				queryClient.setQueryData<IMessage[]>(queryKey, (messages) =>
					messages?.map((m) =>
						m._id === message._id && message._updatedAt.getTime() >= m._updatedAt.getTime() ? { ...message, starred: m.starred } : m,
					),
				);
			}),
		[queryClient, room._id, subscribeToRoomMessages],
	);

	const { t } = useTranslation();

	return (
		<MessageListTab
			iconName='star'
			title={t('Starred_Messages')}
			emptyResultMessage={t('No_starred_messages')}
			context='starred'
			queryResult={starredMessagesQueryResult}
		/>
	);
};

export default StarredMessagesTab;
