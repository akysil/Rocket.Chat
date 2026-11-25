import type { IMessage, Serialized } from '@rocket.chat/core-typings';
import { mockAppRoot, type StreamControllerRef } from '@rocket.chat/mock-providers';
import { act, render, screen } from '@testing-library/react';

import StarredMessagesTab from './StarredMessagesTab';
import { createFakeRoom } from '../../../../tests/mocks/data';

const room = createFakeRoom({ _id: 'room-id', t: 'c' });

jest.mock('../contexts/RoomContext', () => ({
	useRoom: () => room,
}));

jest.mock('./MessageListTab', () => ({
	__esModule: true,
	default: ({ queryResult }: { queryResult: { data?: IMessage[] } }) => (
		<ul>
			{queryResult.data?.map((message) => (
				<li key={message._id}>{message.msg}</li>
			))}
		</ul>
	),
}));

const ts = new Date(Date.UTC(2026, 0, 1)).toISOString();

const starredMessage = {
	_id: 'starred-id',
	rid: room._id,
	msg: 'Hello World',
	ts,
	_updatedAt: ts,
	u: { _id: 'author-id', username: 'author', name: 'Author' },
	starred: [{ _id: 'john.doe' }],
} as unknown as Serialized<IMessage>;

const renderStarredMessagesTab = () => {
	const streamRef: StreamControllerRef<'room-messages'> = {};

	render(<StarredMessagesTab />, {
		wrapper: mockAppRoot()
			.withJohnDoe()
			.withStream('room-messages', streamRef)
			.withEndpoint('GET', '/v1/chat.getStarredMessages', ({ offset }) =>
				offset ? { messages: [], count: 0, offset, total: 1 } : { messages: [starredMessage], count: 1, offset: 0, total: 1 },
			)
			.build(),
	});

	const emitRoomMessage = (message: Partial<IMessage>) =>
		act(() =>
			streamRef.controller?.emit(room._id, [
				{
					...starredMessage,
					ts: new Date(ts),
					_updatedAt: new Date(),
					...message,
				} as IMessage,
			]),
		);

	return { emitRoomMessage };
};

describe('StarredMessagesTab', () => {
	it('should show the edited text of a starred message edited while the panel is open', async () => {
		const { emitRoomMessage } = renderStarredMessagesTab();
		expect(await screen.findByText('Hello World')).toBeInTheDocument();

		emitRoomMessage({ msg: 'Hello World - edited' });

		expect(await screen.findByText('Hello World - edited')).toBeInTheDocument();
		expect(screen.queryByText('Hello World')).not.toBeInTheDocument();
	});

	it('should not list a message from the room that is not starred', async () => {
		const { emitRoomMessage } = renderStarredMessagesTab();
		expect(await screen.findByText('Hello World')).toBeInTheDocument();

		emitRoomMessage({ _id: 'other-id', msg: 'Another message', starred: undefined });

		expect(screen.queryByText('Another message')).not.toBeInTheDocument();
		expect(screen.getAllByRole('listitem')).toHaveLength(1);
	});
});
