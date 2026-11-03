self.addEventListener('push',event=>{const data=event.data?.json()||{};event.waitUntil(self.registration.showNotification(data.title||'Level Up',{body:data.body,tag:data.tag,icon:'/icon.svg'}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow('/'));});
// Do not cache private API responses or pretend offline writes are synchronized.
