import type { IMessage, Serialized } from '@rocket.chat/core-typings';
import { mockAppRoot, type StreamControllerRef } from '@rocket.chat/mock-providers';
import { act, render, screen, waitFor } from '@testing-library/react';

import StarredMessagesTab from './StarredMessagesTab';
import { createFakeRoom } from '../../../../tests/mocks/data';
import { onClientMessageReceived } from '../../../lib/onClientMessageReceived';

const room = createFakeRoom({ _id: 'room-id', t: 'c' });

jest.mock('../contexts/RoomContext', () => ({
	useRoom: () => room,
}));

jest.mock('./MessageListTab', () => ({
	__esModule: true,
	default: ({ queryResult }: { queryResult: { data?: IMessage[] } }) => (
		<ul>
			{queryResult.data?.map((message) => (
				<li key={message._id} title={message.starred?.map(({ _id }) => _id).join(',')}>
					{message.msg}
				</li>
			))}
		</ul>
	),
}));

const ts = new Date(Date.UTC(2026, 0, 1));

const starredMessage = {
	_id: 'starred-id',
	rid: room._id,
	msg: 'Hello World',
	ts: ts.toISOString(),
	_updatedAt: ts.toISOString(),
	u: { _id: 'author-id', username: 'author', name: 'Author' },
	starred: [{ _id: 'john.doe' }],
} as unknown as Serialized<IMessage>;

const editedAt = (minutes: number) => new Date(ts.getTime() + minutes * 60_000);

const renderStarredMessagesTab = ({ serverResponse = Promise.resolve() }: { serverResponse?: Promise<void> } = {}) => {
	const streamRef: StreamControllerRef<'room-messages'> = {};
	const server = { message: starredMessage };

	render(<StarredMessagesTab />, {
		wrapper: mockAppRoot()
			.withJohnDoe()
			.withStream('room-messages', streamRef)
			.withEndpoint('GET', '/v1/chat.getStarredMessages', async ({ offset }) => {
				const { message } = server;
				await serverResponse;
				return offset ? { messages: [], count: 0, offset, total: 1 } : { messages: [message], count: 1, offset: 0, total: 1 };
			})
			.build(),
	});

	const emitEdit = (message: Partial<IMessage>) => {
		const event = { ...starredMessage, ts, _updatedAt: editedAt(1), ...message } as IMessage;
		server.message = { ...event, ts: ts.toISOString(), _updatedAt: event._updatedAt.toISOString() } as unknown as Serialized<IMessage>;
		return act(() => streamRef.controller?.emit(room._id, [event]));
	};

	return { emitEdit };
};

describe('StarredMessagesTab', () => {
	it('should show the edited text of a starred message edited while the panel is open', async () => {
		const { emitEdit } = renderStarredMessagesTab();
		expect(await screen.findByText('Hello World')).toBeInTheDocument();

		await emitEdit({ msg: 'Hello World - edited' });

		expect(await screen.findByText('Hello World - edited')).toBeInTheDocument();
		expect(screen.queryByText('Hello World')).not.toBeInTheDocument();
	});

	it('should show the edited text when the edit arrives while the starred messages are still loading', async () => {
		let respond = () => undefined as void;
		const serverResponse = new Promise<void>((resolve) => {
			respond = resolve;
		});
		const { emitEdit } = renderStarredMessagesTab({ serverResponse });

		await emitEdit({ msg: 'Hello World - edited' });
		await act(async () => respond());

		expect(await screen.findByText('Hello World - edited')).toBeInTheDocument();
		expect(screen.queryByText('Hello World')).not.toBeInTheDocument();
	});

	it('should keep the latest edit when an earlier edit finishes processing last', async () => {
		const { emitEdit } = renderStarredMessagesTab();
		expect(await screen.findByText('Hello World')).toBeInTheDocument();

		let releaseFirstEdit = () => undefined as void;
		const firstEditProcessed = new Promise<void>((resolve) => {
			releaseFirstEdit = resolve;
		});
		const removeTransform = onClientMessageReceived.use(async (message) => {
			if (message.msg === 'first edit') await firstEditProcessed;
			return message;
		});

		try {
			await emitEdit({ msg: 'first edit', _updatedAt: editedAt(1) });
			await emitEdit({ msg: 'second edit', _updatedAt: editedAt(2) });
			expect(await screen.findByText('second edit')).toBeInTheDocument();

			await act(async () => releaseFirstEdit());

			await waitFor(() => expect(screen.queryByText('first edit')).not.toBeInTheDocument());
			expect(screen.getByText('second edit')).toBeInTheDocument();
		} finally {
			removeTransform();
		}
	});

	it("should keep the viewer's own star when the edit carries other users' stars", async () => {
		const { emitEdit } = renderStarredMessagesTab();
		expect(await screen.findByText('Hello World')).toBeInTheDocument();

		await emitEdit({ msg: 'Hello World - edited', starred: [{ _id: 'another-user' }, { _id: 'john.doe' }] });

		expect(await screen.findByText('Hello World - edited')).toHaveAttribute('title', 'john.doe');
	});

	it('should not list a message from the room that is not starred', async () => {
		const { emitEdit } = renderStarredMessagesTab();
		expect(await screen.findByText('Hello World')).toBeInTheDocument();

		await emitEdit({ _id: 'other-id', msg: 'Another message', starred: undefined });

		expect(screen.queryByText('Another message')).not.toBeInTheDocument();
		expect(screen.getAllByRole('listitem')).toHaveLength(1);
	});
});
